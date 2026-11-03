using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Reality404.BuildGate.Editor
{
    public class BuildGatePostBuild : IPostprocessBuildWithReport
    {
        public int callbackOrder => 1000;

        public void OnPostprocessBuild(BuildReport report)
        {
            if (report.summary.platform != BuildTarget.Android) return;
            if (PlayerSettings.GetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android) != ScriptingImplementation.IL2CPP) return;
            string root = Directory.GetParent(Application.dataPath).FullName;
            string dll = Path.Combine(root, "Library", "Bee", "artifacts", "Android", "ManagedStripped", "Reality404.BuildGate.dll");
            if (!File.Exists(dll))
                throw new BuildFailedException("[BuildGate] Reality404.BuildGate 가 스트리핑으로 빠짐 → 앱이 build= 를 찍지 못한다. BuildIdLog 의 [assembly: AlwaysLinkAssembly] 를 확인");
            Debug.Log("[BuildGate] 런타임 어셈블리 포함 확인 (build= 로그)");
        }
    }
}
