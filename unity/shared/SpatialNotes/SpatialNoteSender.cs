// 헤드셋 메모 보내기 (Unity, Quest). 헤드셋을 쓴 채로 말 한마디를 녹음해서,
// 그 순간 보던 것과 거리·각도를 스튜디오(my-mr-studio)로 보낸다.
// 웹 그레이박스(src/xr/spatial-notes.js)와 같은 형식이라, 스튜디오에서는 둘이 똑같이 보인다.
//
// 붙이는 법
//   1. 빈 GameObject 에 이 컴포넌트를 붙이고 serverUrl, appId 를 적는다.
//      serverUrl = 맥에서 npm run dev:xr 을 켰을 때 터미널에 뜬 https://192.168.x.x:5173
//      (http 로 쓰려면 npm run dev -- --host, 그리고 Player Settings > Allow downloads over HTTP = Always allowed)
//   2. 메모 대상이 될 오브젝트에 SpatialNoteTarget 을 붙이고 specPath 에 명세 경로를 적는다 (예: objects.cd_player)
//   3. deskFrame 에 책상 캘리브레이션 원점 Transform 을 넣는다 (x 오른쪽, y 위, z 책상 안쪽 = 명세 좌표).
//      비워 두면 세션 좌표로 남는다 (세션마다 원점이 바뀌니 상대값만 믿게 된다)
//   4. 앱의 손 제스처(손바닥 메뉴 버튼 등)에서 ToggleNote() 를 부른다. 에디터와 XR 시뮬레이터에서는 N 키
//
// 받아쓰기는 하지 않는다. 녹음(wav)만 올라가고, 스튜디오 사람 화면에서 듣고 한 줄로 적는다.
// (Meta Voice SDK 같은 받아쓰기를 붙이면 SetTranscript() 로 넣어 주면 된다)
//
// 이 스크립트는 Unity 밖에서 문법만 확인했어요. 첫 실기 테스트에서 맞는지 봐 주세요.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace MrStudio.SpatialNotes
{
    public class SpatialNoteSender : MonoBehaviour
    {
        [Header("스튜디오")]
        [Tooltip("예: https://192.168.0.12:5173 (맥에서 npm run dev:xr)")]
        public string serverUrl = "https://192.168.0.12:5173";
        [Tooltip("스튜디오 앱 id (studio/apps/<id>)")]
        public string appId = "desk-dream";
        public string source = "unity";
        [Tooltip("어느 장면/빌드에서 남긴 메모인지 (선택)")]
        public string sceneName = "";
        [Tooltip("npm run dev:xr 의 자체 서명 인증서를 받아들인다. 개발용 내부망에서만 켜 둘 것")]
        public bool acceptSelfSignedCertificate = true;

        [Header("공간")]
        [Tooltip("비우면 Camera.main")]
        public Transform head;
        [Tooltip("책상 캘리브레이션 원점. x 오른쪽, y 위, z 책상 안쪽 (명세 좌표)")]
        public Transform deskFrame;
        public Transform leftIndexTip;
        public Transform rightIndexTip;

        [Header("녹음")]
        public int maxSeconds = 30;
        public int sampleRate = 16000;
        public KeyCode editorKey = KeyCode.N;

        [Header("조절 값 (선택)")]
        [Tooltip("ISpatialNoteParams 를 구현한 컴포넌트. 메모 순간의 값(거리, 속도 …)을 같이 남긴다")]
        public MonoBehaviour paramsSource;

        public event Action<string> OnStatus;
        public bool IsRecording => recording;

        const float GazeDeg = 25f;
        const float PointM = 0.10f;

        bool recording;
        float recordStartedAt;
        string transcript = "";
        string snapshotJson;
        AudioClip clip;
        string micDevice;

        void Start()
        {
            if (head == null && Camera.main != null) head = Camera.main.transform;
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone))
                UnityEngine.Android.Permission.RequestUserPermission(UnityEngine.Android.Permission.Microphone);
#endif
        }

        void Update()
        {
#if UNITY_EDITOR
            if (Input.GetKeyDown(editorKey)) ToggleNote();
#endif
            if (recording && Time.realtimeSinceStartup - recordStartedAt > maxSeconds) StopNote();
        }

        public void ToggleNote()
        {
            if (recording) StopNote(); else StartNote();
        }

        public void SetTranscript(string text) { transcript = text ?? ""; }

        public void StartNote()
        {
            if (recording) return;
            snapshotJson = BuildSnapshotJson();
            transcript = "";
            micDevice = Microphone.devices.Length > 0 ? Microphone.devices[0] : null;
            clip = micDevice != null ? Microphone.Start(micDevice, false, maxSeconds + 1, sampleRate) : null;
            recording = true;
            recordStartedAt = Time.realtimeSinceStartup;
            Status(clip != null ? "듣는 중" : "마이크가 없어요. 위치만 남겨요");
        }

        public void StopNote()
        {
            if (!recording) return;
            recording = false;
            float duration = Time.realtimeSinceStartup - recordStartedAt;
            byte[] wav = null;
            if (clip != null)
            {
                int samples = Microphone.GetPosition(micDevice);
                Microphone.End(micDevice);
                if (samples > 0) wav = EncodeWav(clip, samples);
            }
            StartCoroutine(Send(snapshotJson, duration, wav));
        }

        // 글자 메모 (녹음 없이)
        public void SendText(string text)
        {
            transcript = text ?? "";
            StartCoroutine(Send(BuildSnapshotJson(), 0f, null));
        }

        IEnumerator Send(string snapshot, float duration, byte[] wav)
        {
            Status("저장하는 중…");
            string baseUrl = serverUrl.TrimEnd('/') + "/api/p/" + UnityWebRequest.EscapeURL(appId) + "/feel";
            var body = new StringBuilder();
            body.Append('{');
            body.Append("\"source\":").Append(Json.Str(source)).Append(',');
            if (!string.IsNullOrEmpty(sceneName)) body.Append("\"scene\":").Append(Json.Str(sceneName)).Append(',');
            if (!string.IsNullOrEmpty(transcript)) body.Append("\"text\":").Append(Json.Str(transcript)).Append(",\"textBy\":\"speech\",");
            body.Append("\"duration_s\":").Append(Json.Num(duration)).Append(',');
            body.Append("\"expectAudio\":").Append(wav != null ? "true" : "false").Append(',');
            body.Append(snapshot);
            body.Append('}');

            string id = null;
            using (var req = new UnityWebRequest(baseUrl, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.SetRequestHeader("x-actor", "headset");
                if (acceptSelfSignedCertificate) req.certificateHandler = new AcceptDevCertificate();
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { Status("저장 못 함: " + req.error); yield break; }
                id = Json.ReadString(req.downloadHandler.text, "id");
            }

            if (wav != null && id != null)
            {
                using (var up = new UnityWebRequest(baseUrl + "/" + id + "/audio", "POST"))
                {
                    up.uploadHandler = new UploadHandlerRaw(wav);
                    up.downloadHandler = new DownloadHandlerBuffer();
                    up.SetRequestHeader("Content-Type", "audio/wav");
                    up.SetRequestHeader("x-actor", "headset");
                    if (acceptSelfSignedCertificate) up.certificateHandler = new AcceptDevCertificate();
                    yield return up.SendWebRequest();
                    if (up.result != UnityWebRequest.Result.Success) { Status(id + " 저장됨, 녹음은 못 올림: " + up.error); yield break; }
                }
            }
            Status(id + " 저장됨" + (string.IsNullOrEmpty(transcript) ? (wav != null ? " (녹음만)" : "") : ""));
        }

        // ---------- 그 순간의 공간 정보 (spatial-notes.js 와 같은 형식) ----------
        string BuildSnapshotJson()
        {
            if (head == null && Camera.main != null) head = Camera.main.transform;
            Vector3 hp = head != null ? head.position : Vector3.zero;
            Vector3 hf = head != null ? head.forward : Vector3.forward;

            // 대상: 오른손 검지 10cm 안의 것이 먼저, 없으면 시선 25° 안에서 각도가 가장 작은 것
            SpatialNoteTarget target = null;
            string how = "none";
            var all = FindObjectsByType<SpatialNoteTarget>(FindObjectsSortMode.None);
            if (rightIndexTip != null)
            {
                float best = PointM;
                foreach (var t in all)
                {
                    if (!t.isActiveAndEnabled) continue;
                    float d = Vector3.Distance(t.Center, rightIndexTip.position);
                    if (d < best) { best = d; target = t; how = "point"; }
                }
            }
            if (target == null)
            {
                float best = GazeDeg;
                foreach (var t in all)
                {
                    if (!t.isActiveAndEnabled) continue;
                    float deg = Vector3.Angle(hf, t.Center - hp);
                    if (deg < best) { best = deg; target = t; how = "gaze"; }
                }
            }

            var sb = new StringBuilder();
            sb.Append("\"target\":{");
            if (target != null) sb.Append("\"id\":").Append(Json.Str(target.specPath)).Append(",\"label\":").Append(Json.Str(target.Label)).Append(',');
            sb.Append("\"how\":").Append(Json.Str(how)).Append('}');

            if (target != null)
            {
                Vector3 c = target.Center;
                Vector3 flat = new Vector3(c.x - hp.x, 0f, c.z - hp.z);
                Vector3 fwdFlat = new Vector3(hf.x, 0f, hf.z);
                float side = fwdFlat.sqrMagnitude > 1e-6f && flat.sqrMagnitude > 1e-6f ? Vector3.SignedAngle(fwdFlat, flat, Vector3.up) : 0f;
                float below = Mathf.Atan2(hp.y - c.y, flat.magnitude) * Mathf.Rad2Deg;
                sb.Append(",\"rel\":{\"distance_m\":").Append(Json.Num(Vector3.Distance(hp, c)))
                  .Append(",\"below_eye_deg\":").Append(Json.Num(below))
                  .Append(",\"side_deg\":").Append(Json.Num(side));
                float hand = float.MaxValue;
                if (leftIndexTip != null) hand = Mathf.Min(hand, Vector3.Distance(leftIndexTip.position, c));
                if (rightIndexTip != null) hand = Mathf.Min(hand, Vector3.Distance(rightIndexTip.position, c));
                if (hand < float.MaxValue) sb.Append(",\"hand_m\":").Append(Json.Num(hand));
                sb.Append('}');
            }

            // 책상 좌표 (Unity 는 왼손 좌표라 명세 좌표와 축이 그대로 같다)
            bool desk = deskFrame != null;
            Func<Vector3, Vector3> P = p => desk ? deskFrame.InverseTransformPoint(p) : p;
            Func<Vector3, Vector3> D = v => desk ? deskFrame.InverseTransformDirection(v) : v;
            sb.Append(",\"pose\":{\"frame\":").Append(desk ? "\"desk\"" : "\"session\"");
            sb.Append(",\"head\":{\"pos\":").Append(Json.Vec(P(hp))).Append(",\"fwd\":").Append(Json.Vec(D(hf))).Append('}');
            if (leftIndexTip != null) sb.Append(",\"left\":{\"tip\":").Append(Json.Vec(P(leftIndexTip.position))).Append('}');
            if (rightIndexTip != null) sb.Append(",\"right\":{\"tip\":").Append(Json.Vec(P(rightIndexTip.position))).Append('}');
            sb.Append('}');

            if (paramsSource is ISpatialNoteParams ps)
            {
                var values = ps.GetNoteParams();
                if (values != null && values.Count > 0)
                {
                    sb.Append(",\"params\":{");
                    bool first = true;
                    foreach (var kv in values)
                    {
                        if (!first) sb.Append(',');
                        first = false;
                        sb.Append(Json.Str(kv.Key)).Append(':').Append(Json.Value(kv.Value));
                    }
                    sb.Append('}');
                }
            }
            return sb.ToString();
        }

        void Status(string text)
        {
            Debug.Log("[SpatialNote] " + text);
            OnStatus?.Invoke(text);
        }

        // ---------- WAV (16bit PCM) ----------
        static byte[] EncodeWav(AudioClip clip, int sampleCount)
        {
            int channels = clip.channels;
            var data = new float[sampleCount * channels];
            clip.GetData(data, 0);
            int bytes = data.Length * 2;
            var wav = new byte[44 + bytes];
            Put(wav, 0, Encoding.ASCII.GetBytes("RIFF"));
            Put(wav, 4, BitConverter.GetBytes(36 + bytes));
            Put(wav, 8, Encoding.ASCII.GetBytes("WAVEfmt "));
            Put(wav, 16, BitConverter.GetBytes(16));
            Put(wav, 20, BitConverter.GetBytes((short)1));
            Put(wav, 22, BitConverter.GetBytes((short)channels));
            Put(wav, 24, BitConverter.GetBytes(clip.frequency));
            Put(wav, 28, BitConverter.GetBytes(clip.frequency * channels * 2));
            Put(wav, 32, BitConverter.GetBytes((short)(channels * 2)));
            Put(wav, 34, BitConverter.GetBytes((short)16));
            Put(wav, 36, Encoding.ASCII.GetBytes("data"));
            Put(wav, 40, BitConverter.GetBytes(bytes));
            for (int i = 0; i < data.Length; i++)
            {
                short s = (short)Mathf.Clamp(data[i] * 32767f, -32768f, 32767f);
                wav[44 + i * 2] = (byte)(s & 0xff);
                wav[45 + i * 2] = (byte)((s >> 8) & 0xff);
            }
            return wav;
        }

        static void Put(byte[] wav, int at, byte[] b) { Buffer.BlockCopy(b, 0, wav, at, b.Length); }

        // npm run dev:xr 의 자체 서명 인증서용. 개발용 내부망에서만 쓴다
        class AcceptDevCertificate : CertificateHandler
        {
            protected override bool ValidateCertificate(byte[] certificateData) => true;
        }
    }

    // 메모 순간의 조절 값을 같이 남기고 싶을 때 구현한다. 예: { "panel_dist_m": 0.45, "spawn_delay_s": 0.2 }
    public interface ISpatialNoteParams
    {
        Dictionary<string, object> GetNoteParams();
    }

    static class Json
    {
        public static string Num(float v) => float.IsNaN(v) || float.IsInfinity(v) ? "null" : v.ToString("0.###", CultureInfo.InvariantCulture);
        public static string Vec(Vector3 v) => "[" + Num(v.x) + "," + Num(v.y) + "," + Num(v.z) + "]";
        public static string Str(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder("\"");
            foreach (char ch in s)
            {
                switch (ch)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
                        else sb.Append(ch);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
        public static string Value(object v)
        {
            if (v == null) return "null";
            if (v is bool) return (bool)v ? "true" : "false";
            if (v is float) return Num((float)v);
            if (v is double) return Num((float)(double)v);
            if (v is int) return ((int)v).ToString(CultureInfo.InvariantCulture);
            if (v is Vector3) return Vec((Vector3)v);
            return Str(v.ToString());
        }
        // 응답에서 문자열 값 하나만 꺼낸다 ("id":"f3")
        public static string ReadString(string json, string key)
        {
            string k = "\"" + key + "\":\"";
            int i = json.IndexOf(k, StringComparison.Ordinal);
            if (i < 0) return null;
            int s = i + k.Length;
            int e = json.IndexOf('"', s);
            return e > s ? json.Substring(s, e - s) : null;
        }
    }
}
