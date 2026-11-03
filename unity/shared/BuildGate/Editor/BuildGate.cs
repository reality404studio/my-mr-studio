// BuildGate — Android 빌드 직전에 가드레일 검사. 실패가 하나라도 있으면 빌드를 막는다 (우회하지 말고 원인을 고칠 것).
// 통과하면 빌드 ID(git 짧은 해시 + 시각)를 Resources 에 박는다 → 앱 첫 로그 "[<tag>] build=<id>" (BuildIdLog.cs).
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using Debug = UnityEngine.Debug;

namespace Reality404.BuildGate.Editor
{
    public class BuildGate : IPreprocessBuildWithReport
    {
        public const string GeneratedDir = "Assets/BuildGateGenerated/Resources";
        public const string IdAsset = GeneratedDir + "/" + BuildIdLog.ResourceName + ".txt";

        public int callbackOrder => -1000;

        public void OnPreprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.Android) return;
            string root = Directory.GetParent(UnityEngine.Application.dataPath).FullName;
            var cfg = GateConfig.Load(root);
            var results = GateFileChecks.RunAll(root);

            bool dev = (report.summary.options & BuildOptions.Development) != 0;
            if (!dev) results.Add(new GateResult { Level = GateLevel.Warn, Check = "development-build", Message = "Development Build 꺼짐 → logcat 에 Debug.Log 가 안 뜬다" });

            foreach (var r in results)
            {
                if (r.Level == GateLevel.Fail) Debug.LogError("[BuildGate] " + r);
                else if (r.Level == GateLevel.Warn) Debug.LogWarning("[BuildGate] " + r);
                else Debug.Log("[BuildGate] " + r);
            }
            var fails = results.Where(r => r.Level == GateLevel.Fail).ToList();
            if (fails.Count > 0)
                throw new BuildFailedException("[BuildGate] 검사 실패 " + fails.Count + "건:\n" + string.Join("\n", fails.Select(f => f.ToString())));

            string id = MakeBuildId(root) + (dev ? "" : "-rel");
            Directory.CreateDirectory(GeneratedDir);
            File.WriteAllText(IdAsset, cfg.LogTag + "|" + id);
            AssetDatabase.ImportAsset(IdAsset, ImportAssetOptions.ForceSynchronousImport);
            File.WriteAllText(Path.Combine(root, "Library", "BuildGate_last_id.txt"), id);
            Debug.Log($"[BuildGate] 통과. build={id}");
        }

        /// git 짧은 해시 (+ 커밋 안 된 변경이 있으면 -dirty) + 로컬 시각
        public static string MakeBuildId(string root)
        {
            string hash = Git(root, "rev-parse --short HEAD") ?? "nogit";
            string dirty = Git(root, "status --porcelain --untracked-files=no");
            return hash + (string.IsNullOrEmpty(dirty) ? "" : "-dirty") + "-" + DateTime.Now.ToString("MMdd-HHmmss");
        }

        static string Git(string root, string args)
        {
            try
            {
                var psi = new ProcessStartInfo("git", args)
                { WorkingDirectory = root, RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
                using (var p = Process.Start(psi))
                {
                    string o = p.StandardOutput.ReadToEnd().Trim();
                    p.WaitForExit(5000);
                    return p.ExitCode == 0 ? o : null;
                }
            }
            catch { return null; }
        }

        [MenuItem("Tools/Build Gate/Run Checks")]
        static void RunFromMenu()
        {
            string root = Directory.GetParent(UnityEngine.Application.dataPath).FullName;
            var results = GateFileChecks.RunAll(root);
            foreach (var r in results) Debug.Log("[BuildGate] " + r);
            int f = results.Count(r => r.Level == GateLevel.Fail);
            Debug.Log(f == 0 ? "[BuildGate] 전부 통과" : "[BuildGate] 실패 " + f + "건");
        }
    }
}
