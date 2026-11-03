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
            if (Application.isEditor) Id = "editor";
            Debug.Log($"[{Tag}] build={Id}");
        }
    }
}
