import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import OpenAI from 'openai';
// @ts-ignore - package has no types for Node API
import htmlDocx from 'html-docx-js';

dotenv.config();

const app = express();
app.use(cors({ origin: ['http://localhost:5173'], credentials: false }));
app.use(express.json({ limit: '5mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 180_000 });
let OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';

async function readAboutMeFromDisk(): Promise<string | null> {
  const candidates = [
    path.resolve(process.cwd(), '../aboutme.txt'),
    path.resolve(process.cwd(), 'aboutme.txt')
  ];
  for (const p of candidates) {
    try {
      const content = await fs.readFile(p, 'utf8');
      if (content.trim()) return content;
    } catch {}
  }
  return null;
}

function buildJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'title', 'contact', 'summary', 'skills', 'experience'],
    properties: {
      name: { type: 'string' },
      title: { type: 'string' },
      contact: {
        type: 'object',
        additionalProperties: false,
        properties: {
          email: { type: 'string' },
          phone: { type: 'string' },
          location: { type: 'string' },
          website: { type: 'string' },
          linkedin: { type: 'string' },
          github: { type: 'string' }
        }
      },
      summary: { type: 'string' },
      skills: {
        type: 'object',
        additionalProperties: false,
        required: ['core'],
        properties: {
          core: { type: 'array', items: { type: 'string' } },
          tools: { type: 'array', items: { type: 'string' } },
          other: { type: 'array', items: { type: 'string' } }
        }
      },
      experience: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['company', 'role', 'bullets'],
          properties: {
            company: { type: 'string' },
            role: { type: 'string' },
            location: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      projects: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'description'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            link: { type: 'string' },
            technologies: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      education: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['school'],
          properties: {
            school: { type: 'string' },
            degree: { type: 'string' },
            graduationDate: { type: 'string' },
            details: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      certifications: { type: 'array', items: { type: 'string' } }
    }
  } as const;
}
// ensure single declaration


// Shape of the structured resume we expect
interface ResumeData {
  name: string;
  title: string;
  contact: {
    email?: string;
    phone?: string;
    location?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  summary: string;
  skills: {
    core: string[];
    tools?: string[];
    other?: string[];
  };
  experience: Array<{
    company: string;
    role: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    bullets: string[];
  }>;
  projects?: Array<{
    name: string;
    description: string;
    bullets?: string[];
    link?: string;
    technologies?: string[];
  }>;
  education?: Array<{
    school: string;
    degree?: string;
    graduationDate?: string;
    details?: string[];
  }>;
  certifications?: string[];
}

function buildSystemPrompt(): string {
  return [
    'You are an expert resume writer optimizing resumes for ATS systems.',
    'Generate a concise, accomplishment-driven resume based on the candidate\'s background and the target role.',
    'CRITICAL: The resume MUST fit on EXACTLY ONE PAGE when rendered. Aim to fill 95-100% of the page.',
    'Return ONLY strict JSON matching the provided schema. No prose outside JSON.',
    'Guidelines:',
    '- Use short, impact-focused bullet points starting with strong verbs.',
    '- Quantify results where possible (%, $, time saved).',
    '- Prioritize keywords relevant to the target job description.',
    '- Avoid flowery language, keep sentences scannable.',
    '- Never invent facts beyond the candidate input; fill unknowns with best-effort from about me.',
    '- Target 3-5 experience items with 3-4 bullets each for optimal one-page fit.',
    '- IMPORTANT: For experiences at "Oracle" and "UC Berkeley Consulting Club", include ONLY ONE short, concise bullet point each.',
    '- IMPORTANT: In the projects section, include ONLY the "Original Joe\'s" project.',
    '- Keep summary to 2-3 sentences maximum.',
    '- Be concise but comprehensive - every word should add value.'
  ].join('\n');
}

function buildUserPrompt(aboutMe: string, targetText: string): string {
  const schema = {
    name: 'string',
    title: 'string',
    contact: {
      email: 'string?',
      phone: 'string?',
      location: 'string?',
      website: 'string?',
      linkedin: 'string?',
      github: 'string?'
    },
    summary: 'string',
    skills: {
      core: ['string'],
      tools: ['string?'],
      other: ['string?']
    },
    experience: [
      {
        company: 'string',
        role: 'string',
        location: 'string?',
        startDate: 'string?',
        endDate: 'string?',
        bullets: ['string']
      }
    ],
    projects: [
      {
        name: 'string',
        description: 'string',
        bullets: ['string?'],
        link: 'string?',
        technologies: ['string?']
      }
    ],
    education: [
      {
        school: 'string',
        degree: 'string?',
        graduationDate: 'string?',
        details: ['string?']
      }
    ],
    certifications: ['string?']
  };
  return [
    'ABOUT_ME:',
    aboutMe,
    '',
    'TARGET_COMPANY_AND_JOB:',
    targetText,
    '',
    'Output strict JSON for this TypeScript-like schema:',
    JSON.stringify(schema, null, 2),
    '',
    'Rules:',
    '- Return JSON only. No backticks. No commentary.',
    '- Keep bullet items crisp, 1 line each.',
    '- Align content with target role keywords.'
  ].join('\n');
}

async function generateWithOpenAI(aboutMe: string, targetText: string) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(aboutMe, targetText);
  const useResponses = /^gpt-5/i.test(OPENAI_MODEL);

  if (useResponses) {
    try {
      const response = await openai.responses.create({
        model: OPENAI_MODEL,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 1,
        max_output_tokens: 2000,
        text: {
          format: {
            type: 'json_schema',
            json_schema: { name: 'resume_schema', schema: buildJsonSchema(), strict: true }
          }
        }
      } as any);
      // @ts-ignore - helper provided by SDK
      const text: string = (response as any).output_text ?? (response as any).output?.[0]?.content?.[0]?.text ?? '{}';
      return JSON.parse(text);
    } catch (err) {
      console.warn('[OpenAI] responses.create failed, falling back to chat.completions', err);
    }
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });
  const content = completion.choices[0]?.message?.content || '{}';
  return JSON.parse(content);
}

app.post('/api/generate', async (req, res) => {
  try {
    console.log('[Generate] Request received');
    const { targetText, aboutMe } = req.body as { targetText?: string; aboutMe?: string };
    if (!targetText || typeof targetText !== 'string' || targetText.trim().length === 0) {
      return res.status(400).json({ error: 'Missing targetText' });
    }
    let about = aboutMe;
    if (!about || typeof about !== 'string' || about.trim().length === 0) {
      about = (await readAboutMeFromDisk()) || '';
      if (!about) return res.status(400).json({ error: 'Missing aboutMe content' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured in server/.env' });
    }

    console.log(`[Generate] Calling OpenAI API with model: ${OPENAI_MODEL}`);
    const parsed = (await generateWithOpenAI(about, targetText)) as ResumeData;
    console.log('[Generate] OpenAI API responded');

    // Best-effort sanity defaults
    parsed.experience = parsed.experience || [];
    parsed.skills = parsed.skills || { core: [] } as any;

    console.log('[Generate] Success, returning resume');
    return res.json({ resume: parsed });
  } catch (error: any) {
    console.error('[Generate] Error:', error.message, error.stack);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: OPENAI_MODEL });
});

app.get('/api/diagnostics/openai', async (_req, res) => {
  const results: any = { model: OPENAI_MODEL };
  try {
    const t0 = Date.now();
    const response = await openai.responses.create({
      model: OPENAI_MODEL,
      input: 'Return {"ok":true} as strict JSON only.',
      temperature: 1,
      max_output_tokens: 50,
      response_format: { type: 'json_object' }
    } as any);
    const text: string = (response as any).output_text ?? '{}';
    results.responses = { ms: Date.now() - t0, ok: true, text };
  } catch (e: any) {
    results.responses = { ok: false, error: e?.message };
  }
  try {
    const t1 = Date.now();
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 1,
      messages: [
        { role: 'user', content: 'Return {"ok":true} as strict JSON only.' }
      ],
      response_format: { type: 'json_object' }
    });
    const text = completion.choices[0]?.message?.content || '{}';
    results.chat = { ms: Date.now() - t1, ok: true, text };
  } catch (e: any) {
    results.chat = { ok: false, error: e?.message };
  }
  res.json(results);
});

app.post('/api/refine', async (req, res) => {
  try {
    console.log('[Refine] Request received');
    const { resume, feedback } = req.body as { resume?: ResumeData; feedback?: string };
    if (!resume || typeof resume !== 'object') {
      return res.status(400).json({ error: 'Missing resume object' });
    }
    if (!feedback || typeof feedback !== 'string') {
      return res.status(400).json({ error: 'Missing feedback' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured in server/.env' });
    }

    console.log(`[Refine] Calling OpenAI API with model: ${OPENAI_MODEL}`);
    console.log(`[Refine] Feedback: ${feedback}`);

    const systemPrompt = [
      'You are an expert resume writer refining a resume to fit exactly one page.',
      'Your task is to adjust the existing resume based on feedback about its length.',
      'Return ONLY strict JSON matching the provided schema. No prose outside JSON.',
      'Guidelines:',
      '- When told to CONDENSE: shorten bullet points, reduce wordiness, combine similar points, remove less impactful items.',
      '- When told to EXPAND: elaborate on achievements, add quantifiable details, expand descriptions.',
      '- Keep the same structure and sections, just adjust content length.',
      '- Preserve all key accomplishments and quantifiable results.',
      '- Maintain professional tone and ATS optimization.'
    ].join('\n');

    const userPrompt = [
      'Current resume (JSON):',
      JSON.stringify(resume, null, 2),
      '',
      'FEEDBACK:',
      feedback,
      '',
      'Return the refined resume as strict JSON only. No backticks. No commentary.'
    ].join('\n');

    const useResponses = /^gpt-5/i.test(OPENAI_MODEL);

    let parsed: ResumeData;
    if (useResponses) {
      try {
        const response = await openai.responses.create({
          model: OPENAI_MODEL,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 1,
          max_output_tokens: 2000,
          text: {
            format: {
              type: 'json_schema',
              json_schema: { name: 'resume_schema', schema: buildJsonSchema(), strict: true }
            }
          }
        } as any);
        const text: string = (response as any).output_text ?? (response as any).output?.[0]?.content?.[0]?.text ?? '{}';
        parsed = JSON.parse(text);
      } catch (err) {
        console.warn('[Refine] responses.create failed, falling back to chat.completions', err);
        const completion = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          temperature: 1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        });
        const content = completion.choices[0]?.message?.content || '{}';
        parsed = JSON.parse(content);
      }
    } else {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      const content = completion.choices[0]?.message?.content || '{}';
      parsed = JSON.parse(content);
    }

    parsed.experience = parsed.experience || [];
    parsed.skills = parsed.skills || { core: [] } as any;

    console.log('[Refine] Success, returning refined resume');
    return res.json({ resume: parsed });
  } catch (error: any) {
    console.error('[Refine] Error:', error.message, error.stack);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/export/docx', async (req, res) => {
  try {
    const { html, filename } = req.body as { html?: string; filename?: string };
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'Missing html' });
    const wrapped = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${html}</body></html>`;
    // html-docx-js provides asBuffer in Node
    // @ts-ignore
    const buffer: Buffer = (htmlDocx as any).asBuffer ? (htmlDocx as any).asBuffer(wrapped) : (htmlDocx as any).asBlob(wrapped);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(filename || 'resume').replace(/"/g, '')}.docx"`);
    // If asBlob returned, convert to Buffer
    // @ts-ignore
    if (buffer && typeof (buffer as any).arrayBuffer === 'function') {
      // @ts-ignore
      const ab = await (buffer as any).arrayBuffer();
      return res.send(Buffer.from(ab));
    }
    return res.send(buffer);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to export DOCX' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
// Increase or disable timeouts to accommodate longer gpt-5 responses
// 0 disables the timeout in Node 18+/20
try {
  // @ts-ignore
  server.requestTimeout = 0;
  // @ts-ignore
  server.headersTimeout = 0;
} catch {}
