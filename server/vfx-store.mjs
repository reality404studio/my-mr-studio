// VFX 데이터셋 저장소 (studio/vfx-data/) + 선택적 LLM 레시피 생성 프록시.
// 브라우저 스튜디오에서 슬라이더로 조율한 (프롬프트, 초기 레시피, 수정 레시피, 수정 내역, Unity SplatTuning)을
// 레포 안 JSON/JSONL로 차곡차곡 쌓아 Unity 이식과 모델 학습·참조 데이터로 쓸 수 있게 한다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function safeId(raw) {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || `vfx-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
}

export function createVfxStore(root) {
  const dataDir = path.join(root, 'studio', 'vfx-data');
  const recipesDir = path.join(dataDir, 'recipes');
  const jsonlPath = path.join(dataDir, 'dataset.jsonl');

  const ensureDirs = () => {
    fs.mkdirSync(recipesDir, { recursive: true });
  };

  const readAllRecipes = () => {
    if (!fs.existsSync(recipesDir)) return [];
    const files = fs.readdirSync(recipesDir).filter((f) => f.endsWith('.json'));
    const out = [];
    for (const file of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(recipesDir, file), 'utf8'));
        if (parsed && parsed.id) out.push(parsed);
      } catch {
        // 손상된 단일 파일이 전체 목록을 막지 않게 건너뛴다.
      }
    }
    out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return out;
  };

  const rebuildJsonl = (items) => {
    ensureDirs();
    const lines = items.map((item) => JSON.stringify(item)).join('\n');
    const tmp = `${jsonlPath}.tmp`;
    fs.writeFileSync(tmp, lines ? `${lines}\n` : '', 'utf8');
    fs.renameSync(tmp, jsonlPath);
  };

  return {
    dataDir,
    jsonlPath,

    list() {
      const items = readAllRecipes();
      const totalEdits = items.reduce((sum, x) => sum + (Array.isArray(x.sliderEdits) ? x.sliderEdits.length : 0), 0);
      const rated = items.filter((x) => Number(x.rating) > 0);
      const avgRating = rated.length
        ? Number((rated.reduce((s, x) => s + Number(x.rating), 0) / rated.length).toFixed(2))
        : 0;
      return {
        items,
        stats: {
          count: items.length,
          totalEdits,
          avgRating,
          storagePath: 'studio/vfx-data/dataset.jsonl',
        },
      };
    },

    get(id) {
      const clean = safeId(id);
      const file = path.join(recipesDir, `${clean}.json`);
      if (!fs.existsSync(file)) {
        throw Object.assign(new Error('저장된 VFX 샘플을 찾을 수 없어요.'), { status: 404 });
      }
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },

    save(payload = {}) {
      ensureDirs();
      const now = new Date().toISOString();
      const baseSlug = payload.id
        ? safeId(payload.id)
        : safeId(`${payload.name || payload.prompt || 'vfx'}-${Date.now().toString(36).slice(-4)}`);
      let id = baseSlug;
      if (!payload.overwrite && fs.existsSync(path.join(recipesDir, `${id}.json`))) {
        id = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
      }

      const record = {
        schemaVersion: 'vfx-dataset/1',
        id,
        createdAt: payload.createdAt || now,
        updatedAt: now,
        name: String(payload.name || payload.tunedRecipe?.name || 'Untitled VFX').slice(0, 80),
        prompt: String(payload.prompt || '').slice(0, 600),
        source: String(payload.source || 'compiler').slice(0, 32),
        rating: Math.max(0, Math.min(5, Math.round(Number(payload.rating) || 0))),
        tags: Array.isArray(payload.tags)
          ? payload.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
          : [],
        notes: String(payload.notes || '').slice(0, 1000),
        metrics: payload.metrics || null,
        sliderEdits: Array.isArray(payload.sliderEdits) ? payload.sliderEdits.slice(0, 120) : [],
        initialRecipe: payload.initialRecipe || null,
        tunedRecipe: payload.tunedRecipe || null,
        unityTuning: payload.unityTuning || null,
      };

      if (!record.tunedRecipe || typeof record.tunedRecipe !== 'object') {
        throw Object.assign(new Error('저장할 tunedRecipe JSON이 비어 있어요.'), { status: 400 });
      }

      const target = path.join(recipesDir, `${id}.json`);
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
      fs.renameSync(tmp, target);

      rebuildJsonl(readAllRecipes());
      return record;
    },

    remove(id) {
      const clean = safeId(id);
      const file = path.join(recipesDir, `${clean}.json`);
      if (!fs.existsSync(file)) {
        throw Object.assign(new Error('삭제할 VFX 샘플을 찾을 수 없어요.'), { status: 404 });
      }
      fs.unlinkSync(file);
      rebuildJsonl(readAllRecipes());
      return { ok: true, id: clean };
    },

    exportJsonl() {
      const items = readAllRecipes();
      return items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
    },
  };
}

// API 키는 디스크에 저장하지 않고 요청 단위 메모리에서만 사용한다.
export async function generateRecipeViaLlm({
  prompt,
  systemPrompt,
  provider = 'openai',
  apiKey = '',
  model = '',
  endpoint = '',
}) {
  const userPrompt = String(prompt || '').trim();
  const key = String(apiKey || '').trim();
  if (!userPrompt) throw Object.assign(new Error('프롬프트를 입력해 주세요.'), { status: 400 });
  if (!key) throw Object.assign(new Error('API 키를 입력해 주세요.'), { status: 400 });

  let text = '';
  if (provider === 'gemini') {
    const chosenModel = (model || 'gemini-2.5-flash').replace(/[^a-zA-Z0-9._-]/g, '');
    const url = endpoint
      ? endpoint
      : `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data?.error?.message || `Gemini HTTP ${res.status}`), { status: res.status });
    }
    text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  } else {
    const url = endpoint || 'https://api.openai.com/v1/chat/completions';
    const chosenModel = model || 'gpt-4o-mini';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data?.error?.message || `LLM HTTP ${res.status}`), { status: res.status });
    }
    text = data?.choices?.[0]?.message?.content || '';
  }

  const parsed = extractJsonObject(text);
  if (!parsed) {
    throw Object.assign(new Error('모델 응답에서 JSON 레시피를 파싱하지 못했어요.'), { status: 502 });
  }
  return parsed;
}

export function extractJsonObject(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { return JSON.parse(fenced[1].trim()); } catch {}
    }
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(s.slice(start, end + 1)); } catch {}
    }
    return null;
  }
}
