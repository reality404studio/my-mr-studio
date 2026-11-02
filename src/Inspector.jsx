import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { api } from './api.js';
import { TYPES, STATUSES, OWNER_SUGGESTIONS, actorLabel, timeAgo } from './constants.js';

export default function Inspector({ detail, nodesById, onSelect, onClose, onError, onArchived }) {
  const node = detail.node;
  const [title, setTitle] = useState(node.title);
  const [owner, setOwner] = useState(node.owner || '');
  const [tab, setTab] = useState('edit');

  // 메모: 로컬 편집본과 마지막으로 저장된(또는 읽어온) 본을 따로 기억한다.
  const [notes, setNotes] = useState(detail.notes);
  const saved = useRef(detail.notes);
  const [remoteChanged, setRemoteChanged] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const timer = useRef(null);

  useEffect(() => { setTitle(node.title); setOwner(node.owner || ''); }, [node.id, node.title, node.owner]);

  useEffect(() => {
    setNotes(detail.notes);
    saved.current = detail.notes;
    setRemoteChanged(null);
    setSaveState('saved');
    setTab('edit');
  }, [node.id]);

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

  const onNotesChange = (value) => {
    setNotes(value);
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNotes(value), 900);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const patch = async (p) => {
    try { await api.updateNode(node.id, p); } catch (e) { onError(e.message); }
  };

  const archive = async () => {
    if (!window.confirm(`"${node.title}" 단계를 보관할까요? 파일은 studio/_archive 로 옮겨져요.`)) return;
    try { await api.deleteNode(node.id); onArchived(); } catch (e) { onError(e.message); }
  };

  return (
    <aside className={`inspector node--${node.type}`} aria-label="단계 상세">
      <div className="inspector__head">
        <select className="type-select" value={node.type} onChange={(e) => patch({ type: e.target.value })} aria-label="단계 종류">
          {Object.entries(TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </select>
        <span className="inspector__id">{node.id}</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      <input
        className="title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== node.title && patch({ title: title.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="단계 이름"
      />

      <div className="status-row" role="radiogroup" aria-label="상태">
        {Object.entries(STATUSES).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={node.status === k} className={`status-pill is-${k}${node.status === k ? ' is-on' : ''}`} onClick={() => patch({ status: k })}>
            <span className="dot" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <label className="field">
        <span>담당</span>
        <input list="owners" value={owner} placeholder="나, Claude Code…" onChange={(e) => setOwner(e.target.value)} onBlur={() => owner !== (node.owner || '') && patch({ owner })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <datalist id="owners">{OWNER_SUGGESTIONS.map((o) => <option key={o} value={o} />)}</datalist>
      </label>

      {(detail.incoming.length > 0 || detail.outgoing.length > 0) && (
        <div className="links">
          {detail.incoming.length > 0 && (
            <div><span className="links__label">받는 곳</span>{detail.incoming.map((id) => <button key={id} className="link-chip" onClick={() => onSelect(id)}>{nodesById[id]?.title || id}</button>)}</div>
          )}
          {detail.outgoing.length > 0 && (
            <div><span className="links__label">넘기는 곳</span>{detail.outgoing.map((id) => <button key={id} className="link-chip" onClick={() => onSelect(id)}>{nodesById[id]?.title || id}</button>)}</div>
          )}
        </div>
      )}

      <section className="block">
        <div className="block__head">
          <h4>메모</h4>
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
            className="notes"
            value={notes}
            spellCheck={false}
            onChange={(e) => onNotesChange(e.target.value)}
            onBlur={() => saveNotes()}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveNotes(); } }}
            placeholder="이 단계에서 할 일, 결정, 질문을 마크다운으로 적어요."
          />
        ) : (
          <div className="notes-preview" dangerouslySetInnerHTML={{ __html: marked.parse(notes || '_메모가 비어 있어요._') }} />
        )}
        <p className="hint">파일 위치: <code>studio/nodes/{node.id}/README.md</code></p>
      </section>

      <Assets nodeId={node.id} assets={detail.assets} onError={onError} />

      <div className="inspector__foot">
        <span>{actorLabel(node.updatedBy)} · {timeAgo(node.updatedAt)} 수정</span>
        <button className="ghost danger" onClick={archive}>단계 보관</button>
      </div>
    </aside>
  );
}

function Assets({ nodeId, assets, onError }) {
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
          {assets.map((a) => <AssetCard key={a.file} nodeId={nodeId} asset={a} onError={onError} />)}
        </ul>
      )}
    </section>
  );
}

function AssetCard({ nodeId, asset, onError }) {
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
