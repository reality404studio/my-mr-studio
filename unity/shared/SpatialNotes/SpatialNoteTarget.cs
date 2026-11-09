// 헤드셋 메모의 대상이 될 오브젝트에 붙인다. specPath 는 앱 명세(scene_spec.yaml)의 경로다.
// 예: objects.cd_player, ui.palette  → 스튜디오가 메모를 명세의 그 칸에 연결한다
using UnityEngine;

namespace MrStudio.SpatialNotes
{
    public class SpatialNoteTarget : MonoBehaviour
    {
        [Tooltip("명세 경로. 예: objects.cd_player")]
        public string specPath = "objects.";
        [Tooltip("사람이 읽을 이름 (비우면 GameObject 이름)")]
        public string label = "";

        public string Label => string.IsNullOrEmpty(label) ? gameObject.name : label;

        // 렌더러가 있으면 그 경계 상자 가운데, 없으면 Transform 위치
        public Vector3 Center
        {
            get
            {
                var r = GetComponentInChildren<Renderer>();
                return r != null ? r.bounds.center : transform.position;
            }
        }
    }
}
