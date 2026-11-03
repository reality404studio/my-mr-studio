// 앱 첫 로그: "[<tag>] build=<id>". logcat 의 ID 가 기대한 값과 다르면 헛빌드 (가드레일 §6).
using UnityEngine;
using UnityEngine.Scripting;

[assembly: AlwaysLinkAssembly]

namespace Reality404.BuildGate
{
    [Preserve]
    public static class BuildIdLog
    {
        public const string ResourceName = "build_id";

        public static string Tag { get; private set; } = "MP";
        public static string Id { get; private set; } = "unknown";

        [Preserve]
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void LogBuildId()
        {
            var t = Resources.Load<TextAsset>(ResourceName);
            if (t != null)
            {
                string[] parts = t.text.Trim().Split('|');
                if (parts.Length == 2) { Tag = parts[0]; Id = parts[1]; }
            }
            // 에디터 Play 에서는 지난 빌드의 ID 가 남아 있으므로 그대로 쓰지 않는다
            if (Application.isEditor) Id = "editor";
            Debug.Log($"[{Tag}] build={Id}");
        }
    }
}
