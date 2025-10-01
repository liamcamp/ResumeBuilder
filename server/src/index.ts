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
app.use(express.json({ limit: '1mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Utility: read aboutme.txt from repo root (one level up from /server when running locally)
async function readAboutMeFile(): Promise<string> {
  const candidatePaths = [
    path.resolve(process.cwd(), '../aboutme.txt'),
    path.resolve(process.cwd(), 'aboutme.txt')
  ];
  for (const p of candidatePaths) {
    try {
      const content = await fs.readFile(p, 'utf8');
      if (content && content.trim().length > 0) return content;
    } catch {}
  }
  throw new Error('Missing aboutme.txt. Place it at project root.');
}

async function writeAboutMeFile(content: string): Promise<void> {
  const primary = path.resolve(process.cwd(), '../aboutme.txt');
  const fallback = path.resolve(process.cwd(), 'aboutme.txt');
  try {
    await fs.writeFile(primary, content, 'utf8');
  } catch {
    await fs.writeFile(fallback, content, 'utf8');
  }
}

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
    'Return ONLY strict JSON matching the provided schema. No prose outside JSON.',
    'Guidelines:',
    '- Use short, impact-focused bullet points starting with strong verbs.',
    '- Quantify results where possible (%, $, time saved).',
    '- Prioritize keywords relevant to the target job description.',
    '- Avoid flowery language, keep sentences scannable.',
    '- Never invent facts beyond the candidate input; fill unknowns with best-effort from about me.',
    '- Keep sections within reasonable length for a 1–2 page resume.'
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

app.post('/api/generate', async (req, res) => {
  try {
    const { targetText } = req.body as { targetText?: string };
    if (!targetText || typeof targetText !== 'string' || targetText.trim().length === 0) {
      return res.status(400).json({ error: 'Missing targetText' });
    }

    let aboutMe: string;
    try {
      aboutMe = await readAboutMeFile();
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'aboutme.txt not found' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured in server/.env' });
    }

    const system = buildSystemPrompt();
    const user = buildUserPrompt(aboutMe, targetText);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let parsed: ResumeData;
    try {
      parsed = JSON.parse(content) as ResumeData;
    } catch (e) {
      return res.status(502).json({ error: 'Model returned invalid JSON', raw: content });
    }

    // Best-effort sanity defaults
    parsed.experience = parsed.experience || [];
    parsed.skills = parsed.skills || { core: [] } as any;

    return res.json({ resume: parsed });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/aboutme', async (_req, res) => {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), '../aboutme.txt'),
      path.resolve(process.cwd(), 'aboutme.txt')
    ];
    for (const p of candidatePaths) {
      try {
        const content = await fs.readFile(p, 'utf8');
        return res.json({ content });
      } catch {}
    }
    return res.json({ content: '' });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to read aboutme.txt' });
  }
});

app.put('/api/aboutme', async (req, res) => {
  try {
    const { content } = req.body as { content?: string };
    if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' });
    await writeAboutMeFile(content);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: 'Failed to write aboutme.txt' });
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
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
