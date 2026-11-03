import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { TYPES, STATUSES, KINDS, ACTORS, OWNER_SUGGESTIONS, actorLabel, timeAgo } from './constants.js';

export default function Inspector({ api, isShared, detail, stages, nodesById, sharedNodes = [], onSelect, onClose, onError, onArchived }) {
  const node = detail.node;
  const isSub = !!node.parent;
  const isRef = node.type === 'shared';
  const hasKids = detail.children.length > 0;

  const patch = async (p) => {
    try { await api.updateNode(node.id, p); } catch (e) { onError(e.message); }
  };
  const move = async (dir) => {
    try { await api.moveNode(node.id, dir); } catch (e) { onError(e.message); }
  };
  const archive = async () => {
    const what = isSub ? '하위 과업' : hasKids ? `과업과 하위 과업 ${detail.children.length}개` : '과업';
    if (!window.confirm(`"${node.title || node.id}" ${what}을 보관할까요? 메모와 파일은 이 보드의 _archive 폴더로 옮겨져요.`)) return;
    try { await api.deleteNode(node.id); onArchived(); } catch (e) { onError(e.message); }
  };

  return (
    <aside className={`inspector node--${isSub ? nodesById[node.parent]?.type : node.type}`} aria-label={isSub ? '하위 과업 상세' : '과업 상세'}>
      <div className="inspector__head">
        {isSub ? (
          <button className="crumb-btn" onClick={() => onSelect(node.parent)}>{detail.parent?.title} 과업</button>
        ) : isRef ? <span className="type-select is-static">공통</span> : (
          <select className="type-select" value={node.type} onChange={(e) => patch({ type: e.target.value })} aria-label="과업 종류">
            {Object.entries(TYPES).filter(([k]) => k !== 'shared').map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        )}
        <span className="inspector__id">{node.id}</span>
        <div className="order-btns">
          <button className="icon-btn" onClick={() => move('up')} aria-label="위로">↑</button>
          <button className="icon-btn" onClick={() => move('down')} aria-label="아래로">↓</button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      <TextField
        className="title-input"
        value={node.title || ''}
        placeholder={isRef ? '공통 과업 이름을 그대로 써요' : isSub ? '하위 과업 이름' : '과업 이름'}
        onSave={(v) => v.trim() && patch({ title: v.trim() })}
        label={isSub ? '하위 과업 이름' : '과업 이름'}
      />

      {isSub ? (
        <div className="field-grid">
          <label className="field">
            <span>특성</span>
            <select value={node.kind} onChange={(e) => patch({ kind: e.target.value })}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="field">
            <span>하는 쪽</span>
            <div className="seg" role="radiogroup" aria-label="하는 쪽">
              {Object.entries(ACTORS).map(([k, v]) => (
                <button key={k} role="radio" aria-checked={node.by === k} className={node.by === k ? 'is-on' : ''} onClick={() => patch({ by: k })}>{v}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <label className="field">
          <span>단계</span>
          <select value={detail.stage?.id || ''} onChange={(e) => patch({ stage: e.target.value })}>
            {stages.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>)}
          </select>
        </label>
      )}

      {isRef && (
        <section className="ref-block">
          <label className="field">
            <span>가져올 공통 과업</span>
            <select value={node.ref || ''} onChange={(e) => patch({ ref: e.target.value })}>
              <option value="">고르세요</option>
              {sharedNodes.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </label>
          {node.refNode ? (
            <p className="ref-block__status">
              <span className={`status-pill is-${node.status} is-on`}><span className="dot" aria-hidden="true" />{STATUSES[node.status]}</span>
              상태와 하위 과업은 공통 보드에서 관리해요.
            </p>
          ) : <p className="hint">고른 과업의 상태가 이 카드에 그대로 보여요.</p>}
          {node.refNode && <a className="ghost" href={`#/shared?node=${encodeURIComponent(node.ref)}`}>공통에서 열기</a>}
        </section>
      )}

      {isShared && node.usedBy?.length > 0 && (
        <div className="links">
          <div><span className="links__label">쓰는 앱</span>{node.usedBy.map((u) => <a key={u.app} className="link-chip" href={`#/app/${encodeURIComponent(u.app)}?node=${encodeURIComponent(u.node)}`}>{u.name}</a>)}</div>
        </div>
      )}

      {!isRef && (hasKids ? (
        <div className="derived">
          <span className={`status-pill is-${node.status} is-on`}><span className="dot" aria-hidden="true" />{STATUSES[node.status]}</span>
          <span>하위 과업 {node.progress.done}/{node.progress.total} 완료. 상태는 하위 과업에서 계산돼요.</span>
        </div>
      ) : (
        <div className="status-row" role="radiogroup" aria-label="상태">
          {Object.entries(STATUSES).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={node.status === k} className={`status-pill is-${k}${node.status === k ? ' is-on' : ''}`} onClick={() => patch({ status: k })}>
              <span className="dot" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      ))}

      {!isRef && !hasKids && (
        <TextField multiline value={node.success || ''} placeholder="무엇이 관찰되면 끝인지 (테스트 통과, 배치 빌드 결과, 재생 로그 …)" onSave={(v) => patch({ success: v })} label="성공 조건" />
      )}

      {isSub ? (
        <TextField multiline value={node.how || ''} placeholder="어떻게 하는지, 결과를 어디에 남기는지" onSave={(v) => patch({ how: v })} label="방법" />
      ) : !isRef && (
        <>
          <TextField value={node.goal || ''} placeholder="이 과업이 끝나면 무엇이 달라지는지" onSave={(v) => patch({ goal: v })} label="목표" />
          <TextField value={node.output || ''} placeholder="산출물과 위치 (예: scene_spec.yaml)" onSave={(v) => patch({ output: v })} label="산출물" />
          <TextField value={node.owner || ''} placeholder="나, Claude Code…" list="owners" onSave={(v) => patch({ owner: v })} label="담당" />
          <datalist id="owners">{OWNER_SUGGESTIONS.map((o) => <option key={o} value={o} />)}</datalist>
        </>
      )}

      {!isSub && (detail.incoming.length > 0 || detail.outgoing.length > 0) && (
        <div className="links">
          {detail.incoming.length > 0 && (
            <div>
              <span className="links__label">기다리는 과업</span>
              {detail.incoming.map((e) => (
                <button key={e.id} className={`link-chip${node.waitingOn?.includes(e.id) ? ' is-waiting' : ''}`} onClick={() => onSelect(e.id)}>
                  {nodesById[e.id]?.title || e.id}{e.kind === 'feedback' ? ' (되돌림)' : node.waitingOn?.includes(e.id) ? ' · 안 끝남' : ''}
                </button>
              ))}
            </div>
          )}
          {detail.outgoing.length > 0 && (
            <div>
              <span className="links__label">넘기는 과업</span>
              {detail.outgoing.map((e) => <button key={e.id} className="link-chip" onClick={() => onSelect(e.id)}>{nodesById[e.id]?.title || e.id}{e.kind === 'feedback' ? ' (되돌림)' : ''}</button>)}
            </div>
          )}
        </div>
      )}

      {!isSub && !isRef && (
        <section className="block">
          <div className="block__head"><h4>하위 과업 {hasKids && <span className="count">{detail.children.length}</span>}</h4></div>
          {hasKids && (
            <ol className="sub-list">
              {detail.children.map((c) => (
                <li key={c.id}>
                  <button className={`sub is-${c.status}${c.isCurrent ? ' is-current' : ''}`} onClick={() => onSelect(c.id)}>
                    <span className="dot" aria-hidden="true" />
                    <span className={`kind kind--${c.kind}`}>{KINDS[c.kind]}</span>
                    <span className="sub__title">{c.title}</span>
                    <span className={`by by--${c.by}`}>{c.by === 'human' ? '사람' : 'AI'}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <SubAdder api={api} parent={node.id} onError={onError} />
          <p className="hint">하위 과업은 위에서부터 순서대로 진행돼요. 앞의 것이 끝나야 다음이 "지금 할 일"에 떠요.</p>
        </section>
      )}

      <Notes key={node.id} api={api} detail={detail} onError={onError} title={isSub ? '메모' : isRef ? '이 앱에서의 메모' : '메모'} />

      <Assets api={api} nodeId={node.id} assets={detail.assets} onError={onError} />

      <div className="inspector__foot">
        <span>{actorLabel(node.updatedBy)} · {timeAgo(node.updatedAt)} 수정</span>
        <button className="ghost danger" onClick={archive}>보관</button>
      </div>
    </aside>
  );
}

// 포커스를 잃거나 Enter 를 누르면 저장하는 입력칸. 바깥에서 값이 바뀌면 따라간다.
function TextField({ value, onSave, label, placeholder, multiline, className, list }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const save = () => { if (v !== value) onSave(v); };
  const common = {
    value: v,
    placeholder,
    onChange: (e) => setV(e.target.value),
    onBlur: save,
    'aria-label': label,
  };
  if (className === 'title-input') {
    return <input className="title-input" {...common} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
  }
  return (
    <label className="field">
      <span>{label}</span>
      {multiline
        ? <textarea rows={2} {...common} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.currentTarget.blur()} />
        : <input list={list} {...common} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />}
    </label>
  );
}

function SubAdder({ api, parent, onError }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('write');
  const [by, setBy] = useState('agent');
  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try { await api.createNode({ parent, kind, by, title: title.trim() }); setTitle(''); } catch (err) { onError(err.message); }
  };
  return (
    <form className="sub-adder" onSubmit={add}>
      <select value={kind} onChange={(e) => { setKind(e.target.value); setBy(e.target.value === 'decide' ? 'human' : by); }} aria-label="특성">
        {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={by} onChange={(e) => setBy(e.target.value)} aria-label="하는 쪽">
        {Object.entries(ACTORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="하위 과업 추가" aria-label="하위 과업 이름" />
      <button type="submit" className="ghost" disabled={!title.trim()}>추가</button>
    </form>
  );
}

function Notes({ api, detail, onError, title }) {
  const node = detail.node;
  const [tab, setTab] = useState('edit');
  // 로컬 편집본과 마지막으로 저장된(또는 읽어온) 본을 따로 기억한다.
  const [notes, setNotes] = useState(detail.notes);
  const saved = useRef(detail.notes);
  const [remoteChanged, setRemoteChanged] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const timer = useRef(null);

  useEffect(() => {
    if (detail.notes === saved.current) return;
    if (notes === saved.current) {
      setNotes(detail.notes);
      saved.current = detail.notes;
    } else {
      setRemoteChanged(detail.notes);
    }
  }, [detail.notes]);

  const saveNotes = async (value = notes) => {
    clearTimeout(timer.current);
    if (value === saved.current) return setSaveState('saved');
    setSaveState('saving');
    try {
      await api.writeNotes(node.id, value);
      saved.current = value;
      setSaveState('saved');
    } catch (e) { setSaveState('error'); onError(e.message); }
  };

  const onChange = (value) => {
    setNotes(value);
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNotes(value), 900);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <section className="block">
      <div className="block__head">
        <h4>{title}</h4>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'is-on' : ''} onClick={() => setTab('edit')}>편집</button>
          <button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'is-on' : ''} onClick={() => setTab('preview')}>미리보기</button>
        </div>
        <span className={`save-state is-${saveState}`}>
          {{ saved: '저장됨', dirty: '수정 중', saving: '저장 중', error: '저장 실패' }[saveState]}
        </span>
      </div>
      {remoteChanged !== null && (
        <div className="banner">
          다른 곳(에이전트 등)에서 이 메모가 바뀌었어요.
          <button onClick={() => { setNotes(remoteChanged); saved.current = remoteChanged; setRemoteChanged(null); setSaveState('saved'); }}>바뀐 내용 불러오기</button>
          <button onClick={() => setRemoteChanged(null)}>내 편집 유지</button>
        </div>
      )}
      {tab === 'edit' ? (
        <textarea
          className={`notes${node.parent && !notes ? ' is-short' : ''}`}
          value={notes}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => saveNotes()}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveNotes(); } }}
          placeholder={node.parent ? '이 하위 과업의 결과나 질문을 적어요. 비워 둬도 돼요.' : '이 과업의 할 일, 결정, 질문을 마크다운으로 적어요.'}
        />
      ) : (
        <div className="notes-preview" dangerouslySetInnerHTML={{ __html: marked.parse(notes || '_메모가 비어 있어요._') }} />
      )}
      <p className="hint">파일 위치: <code>{detail.notesPath}</code></p>
    </section>
  );
}

function Assets({ api, nodeId, assets, onError }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const input = useRef(null);

  const upload = async (files) => {
    const list = [...files];
    setBusy((n) => n + list.length);
    for (const f of list) {
      try { await api.uploadAsset(nodeId, f); } catch (e) { onError(`${f.name}: ${e.message}`); }
      setBusy((n) => n - 1);
    }
  };

  return (
    <section className="block">
      <div className="block__head">
        <h4>파일 {assets.length > 0 && <span className="count">{assets.length}</span>}</h4>
        {busy > 0 && <span className="save-state is-saving">올리는 중 {busy}</span>}
      </div>
      <div
        className={`drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        이미지·영상·문서를 끌어다 놓거나 눌러서 고르세요
        <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {assets.length > 0 && (
        <ul className="assets">
          {assets.map((a) => <AssetCard key={a.file} api={api} nodeId={nodeId} asset={a} onError={onError} />)}
        </ul>
      )}
    </section>
  );
}

function AssetCard({ api, nodeId, asset, onError }) {
  const [memo, setMemo] = useState(asset.memo || '');
  useEffect(() => setMemo(asset.memo || ''), [asset.memo]);
  const isVideo = /\.(mp4|webm|mov)$/i.test(asset.file);
  return (
    <li className="asset">
      <a href={asset.url} target="_blank" rel="noreferrer" className="asset__media">
        {asset.image ? <img src={asset.url} alt={asset.memo || asset.file} loading="lazy" />
          : isVideo ? <video src={asset.url} muted preload="metadata" />
          : <span className="asset__ext">{asset.file.split('.').pop()}</span>}
      </a>
      <div className="asset__body">
        <span className="asset__name" title={asset.file}>{asset.file}</span>
        <input
          className="asset__memo"
          value={memo}
          placeholder="왜 골랐나요? 예: 이 색감만"
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => memo !== (asset.memo || '') && api.updateAsset(nodeId, asset.file, memo).catch((e) => onError(e.message))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
      <button className="icon-btn" aria-label={`${asset.file} 보관`} onClick={() => window.confirm(`${asset.file} 파일을 보관할까요?`) && api.deleteAsset(nodeId, asset.file).catch((e) => onError(e.message))}>✕</button>
    </li>
  );
}
