using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace Reality404.BuildGate
{
    public enum GateLevel { Fail, Warn, Info }

    public struct GateResult
    {
        public GateLevel Level;
        public string Check;
        public string Message;
        public override string ToString() { return $"[{Level.ToString().ToUpperInvariant()}] {Check}: {Message}"; }
    }

    public class GateConfig
    {
        public string LogTag = "MP";
        public bool RequireCameraPermission = true;
        public string[] ForbiddenApis = { "Shader.Find", "ReadPixels", "WebCamTexture", "OVRInput" };

        public static GateConfig Load(string projectRoot)
        {
            var c = new GateConfig();
            string p = Path.Combine(projectRoot, "ProjectSettings", "BuildGate.json");
            if (!File.Exists(p)) return c;
            string t = File.ReadAllText(p);
            var tag = Regex.Match(t, "\"logTag\"\\s*:\\s*\"([^\"]*)\"");
            if (tag.Success) c.LogTag = tag.Groups[1].Value;
            var cam = Regex.Match(t, "\"requireCameraPermission\"\\s*:\\s*(true|false)");
            if (cam.Success) c.RequireCameraPermission = cam.Groups[1].Value == "true";
            var apis = Regex.Match(t, "\"forbiddenApis\"\\s*:\\s*\\[([^\\]]*)\\]");
            if (apis.Success)
                c.ForbiddenApis = Regex.Matches(apis.Groups[1].Value, "\"([^\"]+)\"").Cast<Match>().Select(m => m.Groups[1].Value).ToArray();
            return c;
        }
    }

    public static class GateFileChecks
    {
        const string CameraPermission = "horizonos.permission.HEADSET_CAMERA";

        public static List<GateResult> RunAll(string projectRoot) => RunAll(projectRoot, null);

        public static List<GateResult> RunAll(string projectRoot, IEnumerable<string> scenes)
        {
            var cfg = GateConfig.Load(projectRoot);
            var r = new List<GateResult>();
            CheckXrLoaders(projectRoot, r);
            CheckRenderPipeline(projectRoot, r);
            if (cfg.RequireCameraPermission) CheckManifest(projectRoot, r);
            string rigGuid = FindCameraRigGuid(projectRoot);
            foreach (string scene in scenes ?? EnabledScenes(projectRoot)) CheckScene(projectRoot, scene, rigGuid, r);
            CheckOutlineMaterials(projectRoot, r);
            CheckForbiddenApis(projectRoot, cfg.ForbiddenApis, r);
            CheckHandTracking(projectRoot, r);
            CheckComments(projectRoot, r);
            return r;
        }

        static void CheckHandTracking(string root, List<GateResult> r)
        {
            string p = Path.Combine(root, "Assets", "Oculus", "OculusProjectConfig.asset");
            if (!File.Exists(p)) { Add(r, GateLevel.Fail, "hand-tracking", "OculusProjectConfig.asset 없음"); return; }
            var m = Regex.Match(File.ReadAllText(p), @"handTrackingSupport: (\d+)");
            if (m.Success && (m.Groups[1].Value == "1" || m.Groups[1].Value == "2"))
                Add(r, GateLevel.Info, "hand-tracking", m.Groups[1].Value == "1" ? "ControllersAndHands" : "HandsOnly");
            else Add(r, GateLevel.Fail, "hand-tracking", "handTrackingSupport 가 ControllersOnly(0) 또는 없음 → 핸즈 퍼스트 앱에서 손이 안 잡힘");
        }

        public static readonly string[] CommentLintExemptFiles = { "MetaQuestVRSetup.cs" };
        static readonly Regex UsageHeader = new Regex(@"-batchmode|사용:");

        static IEnumerable<string> CommentLintRoots(string root)
        {
            yield return Path.Combine(root, "Assets", "Scripts");
            yield return Path.Combine(root, "Assets", "Editor");
            yield return Path.GetFullPath(Path.Combine(root, "..", "shared"));
        }

        static void CheckComments(string root, List<GateResult> r)
        {
            int hits = 0;
            foreach (string dir in CommentLintRoots(root))
            {
                if (!Directory.Exists(dir)) continue;
                foreach (string cs in Directory.GetFiles(dir, "*.cs", SearchOption.AllDirectories))
                {
                    string n = cs.Replace('\\', '/');
                    if (n.Contains("/obj/") || n.Contains("/bin/") || CommentLintExemptFiles.Contains(Path.GetFileName(cs))) continue;
                    foreach (int line in CommentLines(File.ReadAllLines(cs)))
                    {
                        Add(r, GateLevel.Fail, "comment", $"{Display(root, cs)}:{line} 주석 금지 → 이유는 카드 메모, 규칙은 게이트·테스트로");
                        hits++;
                    }
                }
            }
            if (hits == 0) Add(r, GateLevel.Info, "comment", "주석 없음 (배치 실행 안내 머리말 제외)");
        }

        public static List<int> CommentLines(string[] lines)
        {
            var result = new List<int>();
            bool inBlock = false, header = true;
            for (int i = 0; i < lines.Length; i++)
            {
                bool had = HasComment(lines[i], ref inBlock, out bool codeToo);
                if (!had) { if (lines[i].Trim().Length > 0) header = false; continue; }
                if (header && !codeToo && UsageHeader.IsMatch(lines[i])) continue;
                if (codeToo) header = false;
                result.Add(i + 1);
            }
            return result;
        }

        static bool HasComment(string line, ref bool inBlock, out bool codeToo)
        {
            bool found = inBlock, inStr = false, verbatim = false, inChar = false;
            codeToo = false;
            for (int i = 0; i < line.Length; i++)
            {
                char c = line[i], nx = i + 1 < line.Length ? line[i + 1] : '\0';
                if (inBlock) { if (c == '*' && nx == '/') { inBlock = false; i++; } continue; }
                if (inStr)
                {
                    if (verbatim) { if (c == '"' && nx == '"') i++; else if (c == '"') inStr = false; }
                    else if (c == '\\') i++;
                    else if (c == '"') inStr = false;
                    continue;
                }
                if (inChar) { if (c == '\\') i++; else if (c == '\'') inChar = false; continue; }
                if (c == '/' && nx == '/') return true;
                if (c == '/' && nx == '*') { found = inBlock = true; i++; continue; }
                if (c == '"') { inStr = true; verbatim = i > 0 && (line[i - 1] == '@' || (line[i - 1] == '$' && i > 1 && line[i - 2] == '@')); codeToo = true; continue; }
                if (c == '\'') { inChar = true; codeToo = true; continue; }
                if (!char.IsWhiteSpace(c)) codeToo = true;
            }
            return found;
        }

        static string Display(string root, string p)
        {
            string full = Path.GetFullPath(p), r = Path.GetFullPath(root);
            return full.StartsWith(r) ? Rel(root, full) : Path.GetRelativePath(r, full).Replace('\\', '/');
        }

        static void Add(List<GateResult> r, GateLevel l, string check, string msg) { r.Add(new GateResult { Level = l, Check = check, Message = msg }); }

        static void CheckXrLoaders(string root, List<GateResult> r)
        {
            string p = Path.Combine(root, "Assets", "XR", "Settings", "XRGeneralSettingsPerBuildTarget.asset");
            if (!File.Exists(p)) { Add(r, GateLevel.Fail, "xr-loader", "XRGeneralSettingsPerBuildTarget.asset 없음 (XR Plug-in Management 미설정)"); return; }
            foreach (string block in Regex.Split(File.ReadAllText(p), @"^--- !u!", RegexOptions.Multiline))
            {
                if (!block.Contains("m_Name: XRManagerSettings Android")) continue;
                var m = Regex.Match(block, @"m_Loaders:\s*\n((?:\s*- \{fileID: -?\d+\}\s*\n)*)");
                int n = m.Success ? Regex.Matches(m.Groups[1].Value, @"- \{fileID").Count : 0;
                if (Regex.IsMatch(block, @"m_Loaders: \[\]")) n = 0;
                if (n == 1) Add(r, GateLevel.Info, "xr-loader", "Android 로더 1개");
                else Add(r, GateLevel.Fail, "xr-loader", $"Android 로더 {n}개 (정확히 1개여야 함. 0개면 'Vulkan does not support XR')");
                return;
            }
            Add(r, GateLevel.Fail, "xr-loader", "Android 용 XRManagerSettings 없음");
        }

        static void CheckRenderPipeline(string root, List<GateResult> r)
        {
            string gs = Path.Combine(root, "ProjectSettings", "GraphicsSettings.asset");
            string qs = Path.Combine(root, "ProjectSettings", "QualitySettings.asset");
            bool def = File.Exists(gs) && Regex.IsMatch(File.ReadAllText(gs), @"m_CustomRenderPipeline: \{fileID: [1-9]");
            bool android = false;
            if (File.Exists(qs))
            {
                string t = File.ReadAllText(qs);
                var lvl = Regex.Match(t, @"m_PerPlatformDefaultQuality:[\s\S]*?\n\s*Android: (\d+)");
                var levels = Regex.Matches(t, @"customRenderPipeline: \{fileID: (-?\d+)");
                if (lvl.Success && int.TryParse(lvl.Groups[1].Value, out int i) && i < levels.Count)
                    android = levels[i].Groups[1].Value != "0";
            }
            if (def || android) Add(r, GateLevel.Info, "render-pipeline", "파이프라인 에셋 있음" + (def ? " (Graphics 기본)" : " (Android 품질 단계)"));
            else Add(r, GateLevel.Fail, "render-pipeline", "Graphics 기본·Android 품질 단계 모두 파이프라인 에셋 없음 → URP 머티리얼 마젠타");
        }

        static void CheckManifest(string root, List<GateResult> r)
        {
            string p = Path.Combine(root, "Assets", "Plugins", "Android", "AndroidManifest.xml");
            if (!File.Exists(p)) { Add(r, GateLevel.Fail, "manifest", "Assets/Plugins/Android/AndroidManifest.xml 없음"); return; }
            if (File.ReadAllText(p).Contains("\"" + CameraPermission + "\"")) Add(r, GateLevel.Info, "manifest", CameraPermission + " 있음");
            else Add(r, GateLevel.Fail, "manifest", CameraPermission + " 없음 (매니페스트를 다시 만들었다면 빠졌을 수 있음)");
        }

        static IEnumerable<string> EnabledScenes(string root)
        {
            string p = Path.Combine(root, "ProjectSettings", "EditorBuildSettings.asset");
            if (!File.Exists(p)) yield break;
            foreach (Match m in Regex.Matches(File.ReadAllText(p), @"- enabled: 1\s*\n\s*path: (.+)"))
                yield return m.Groups[1].Value.Trim();
        }

        static string FindCameraRigGuid(string root)
        {
            string cache = Path.Combine(root, "Library", "PackageCache");
            if (!Directory.Exists(cache)) return null;
            foreach (string d in Directory.GetDirectories(cache, "com.meta.xr.sdk.core@*"))
            {
                string meta = Path.Combine(d, "Prefabs", "OVRCameraRig.prefab.meta");
                if (!File.Exists(meta)) continue;
                var m = Regex.Match(File.ReadAllText(meta), @"guid: ([0-9a-f]{32})");
                if (m.Success) return m.Groups[1].Value;
            }
            return null;
        }

        static void CheckScene(string root, string scenePath, string rigGuid, List<GateResult> r)
        {
            string p = Path.Combine(root, scenePath);
            string name = Path.GetFileNameWithoutExtension(scenePath);
            if (!File.Exists(p)) { Add(r, GateLevel.Fail, "scene", scenePath + " 없음 (빌드 씬 목록)"); return; }
            string t = File.ReadAllText(p);

            var sky = Regex.Match(t, @"m_SkyboxMaterial: \{fileID: (-?\d+)");
            if (sky.Success && sky.Groups[1].Value == "0") Add(r, GateLevel.Info, "skybox", name + ": None");
            else Add(r, GateLevel.Fail, "skybox", name + ": Skybox Material 이 남아 있음 → 패스스루 대신 스카이박스");

            int direct = Regex.Matches(t, @"^--- !u!20 &-?\d+\s*$", RegexOptions.Multiline).Count;
            if (direct > 0) Add(r, GateLevel.Fail, "camera", $"{name}: 씬에 직접 놓은 Camera {direct}개 (Main Camera 중복 → 불투명 카메라가 덮음)");

            if (rigGuid == null) { Add(r, GateLevel.Warn, "camera", "OVRCameraRig 프리팹 GUID 를 못 찾음 (Library 없음?) → 리그 개수 검사 생략"); return; }
            int rigs = Regex.Matches(t, @"m_SourcePrefab: \{fileID: 100100000, guid: " + rigGuid).Count;
            if (rigs == 1) Add(r, GateLevel.Info, "camera", name + ": OVRCameraRig 1개");
            else Add(r, GateLevel.Fail, "camera", $"{name}: OVRCameraRig {rigs}개 (정확히 1개)");
        }

        static void CheckOutlineMaterials(string root, List<GateResult> r)
        {
            string assets = Path.Combine(root, "Assets");
            foreach (string mat in Directory.GetFiles(assets, "*.mat", SearchOption.AllDirectories))
            {
                if (Path.GetFileName(mat).IndexOf("outline", StringComparison.OrdinalIgnoreCase) < 0) continue;
                var m = Regex.Match(File.ReadAllText(mat), @"- _Cull: (\d+)");
                string rel = Rel(root, mat);
                if (!m.Success) Add(r, GateLevel.Fail, "outline-cull", rel + ": _Cull 속성 없음");
                else if (m.Groups[1].Value != "1") Add(r, GateLevel.Fail, "outline-cull", $"{rel}: _Cull {m.Groups[1].Value} (1 = Back 이어야 함. Front 면 검은 덩어리)");
            }
        }

        static void CheckForbiddenApis(string root, string[] apis, List<GateResult> r)
        {
            string assets = Path.Combine(root, "Assets");
            int hits = 0;
            foreach (string cs in Directory.GetFiles(assets, "*.cs", SearchOption.AllDirectories))
            {
                string rel = Rel(root, cs);
                if (rel.Split('/').Contains("Editor")) continue;
                string[] lines = File.ReadAllLines(cs);
                bool inBlock = false;
                for (int i = 0; i < lines.Length; i++)
                {
                    string code = StripComments(lines[i], ref inBlock);
                    foreach (string api in apis)
                        if (Regex.IsMatch(code, @"(?<!\w)" + Regex.Escape(api) + @"\b"))
                        { Add(r, GateLevel.Fail, "forbidden-api", $"{rel}:{i + 1} {api}"); hits++; }
                }
            }
            if (hits == 0) Add(r, GateLevel.Info, "forbidden-api", "없음 (" + string.Join(", ", apis) + ")");
        }

        static string StripComments(string line, ref bool inBlock)
        {
            var sb = new System.Text.StringBuilder();
            bool inStr = false;
            for (int i = 0; i < line.Length; i++)
            {
                if (inBlock) { if (i + 1 < line.Length && line[i] == '*' && line[i + 1] == '/') { inBlock = false; i++; } continue; }
                if (!inStr && i + 1 < line.Length && line[i] == '/' && line[i + 1] == '/') break;
                if (!inStr && i + 1 < line.Length && line[i] == '/' && line[i + 1] == '*') { inBlock = true; i++; continue; }
                if (line[i] == '"' && (i == 0 || line[i - 1] != '\\')) inStr = !inStr;
                if (!inStr) sb.Append(line[i]);
            }
            return sb.ToString();
        }

        static string Rel(string root, string p) { return p.Substring(root.Length).TrimStart('/', '\\').Replace('\\', '/'); }
    }
}
