// API simulada, só para a versão de pré-visualização (VITE_PREVIEW=true).
// Tudo roda no navegador, com dados fictícios, e some ao recarregar a página.
export const PREVIEW_MODE = import.meta.env?.VITE_PREVIEW === 'true';

const PROFESSOR_ID = 1;
const now = () => new Date().toISOString();
const wait = (ms) => new Promise((resolve) => { globalThis.setTimeout(resolve, ms); });

let sequence = 100;
const nextId = () => { sequence += 1; return sequence; };

const professor = {
  idProfessor: PROFESSOR_ID,
  nome: 'Ana Beatriz Carvalho',
  email: 'ana.carvalho@exemplo.edu.br',
  materia: 'Medicina',
  cargo: 'Professora',
};

const sampleContent = {
  sintomas: 'Dor precordial em aperto, com irradiação para o membro superior esquerdo, desencadeada ao subir escadas e aliviada com repouso em cerca de 5 minutos. Refere dispneia leve associada.',
  contexto: 'Procura o ambulatório após três episódios semelhantes nas últimas duas semanas, sem febre ou tosse.',
  examClinico: 'PA 150/95 mmHg, FC 88 bpm, ritmo regular, sem sopros. Pulmões limpos, sem edema periférico.',
  antecClinico: 'Hipertensão arterial há 10 anos, dislipidemia e ex-tabagista (20 maços-ano).',
  diagEsperado: 'Angina estável.',
};

const db = {
  casos: [],
  pacientes: [],
  conteudos: [],
  perguntas: [],
};

function seed() {
  const titles = [
    ['Dor torácica aos esforços em paciente hipertensa', 'PUBLICADO', 'Cardiologia'],
    ['Dispneia progressiva e edema de membros inferiores', 'RASCUNHO', 'Cardiologia'],
    ['Febre e tosse produtiva há cinco dias', 'ARQUIVADO', 'Pneumologia'],
    ['Cefaleia súbita de forte intensidade', 'PUBLICADO', 'Neurologia'],
    ['Dor abdominal em fossa ilíaca direita', 'RASCUNHO', 'Cirurgia geral'],
  ];
  titles.forEach(([titulo, status, especialidade], index) => {
    const idCaso = nextId();
    db.casos.push({
      idCaso,
      idProfessor: PROFESSOR_ID,
      titulo,
      status,
      especialidade,
      disciplina: 'Semiologia médica',
      areaSaude: 'Medicina',
      estilo: 'Múltipla escolha',
      nivelDificuldade: ['BAIXA', 'MEDIA', 'ALTA'][index % 3],
      objetivoAprendizagem: 'Reconhecer os sinais principais do quadro e definir a conduta inicial adequada.',
      dataCriacao: new Date(Date.now() - index * 86400000).toISOString(),
    });
    db.pacientes.push({
      idPaciente: nextId(), idCaso, nome: 'Maria Aparecida Souza', idade: 58, sexo: 'FEMININO',
      estadoCivil: 'CASADO', profissao: 'Professora', peso: '72 kg', altura: '1,65 m',
    });
    db.conteudos.push({ idConteudo: nextId(), idCaso, ...sampleContent });
    db.perguntas.push(...sampleQuestions(idCaso));
  });
}

function sampleQuestions(idCaso) {
  return [
    {
      id: nextId(), idCaso, tipo: 'MULTIPLA_ESCOLHA',
      texto: 'Qual é a principal hipótese diagnóstica para o quadro apresentado?',
      alternativas: [
        { id: nextId(), letra: 'A', texto: 'Angina estável', correta: true },
        { id: nextId(), letra: 'B', texto: 'Pneumonia adquirida na comunidade', correta: false },
        { id: nextId(), letra: 'C', texto: 'Refluxo gastroesofágico', correta: false },
        { id: nextId(), letra: 'D', texto: 'Dissecção aguda de aorta', correta: false },
      ],
      gabarito: 'A',
      resposta: 'A dor desencadeada por esforço e aliviada pelo repouso sugere angina estável.',
    },
    {
      id: nextId(), idCaso, tipo: 'VERDADEIRO_FALSO',
      texto: 'A elevação de troponina é obrigatória para o diagnóstico de angina estável.',
      alternativas: [],
      gabarito: 'FALSO',
      resposta: 'Na angina estável a troponina costuma ser normal.',
    },
  ];
}

seed();

const complete = (idCaso) => ({
  caso: db.casos.find((item) => item.idCaso === idCaso),
  pacientes: db.pacientes.filter((item) => item.idCaso === idCaso),
  conteudosClinicos: db.conteudos.filter((item) => item.idCaso === idCaso),
  perguntas: db.perguntas.filter((item) => item.idCaso === idCaso),
});

const authResponse = (username) => ({
  token: 'preview-token',
  tipo: 'Bearer',
  idProfessor: PROFESSOR_ID,
  username: username || 'ana.carvalho@exemplo.edu.br',
  role: 'PROFESSOR',
});

function notFound() {
  const error = new Error('Não encontrado.');
  error.status = 404;
  throw error;
}

function pageOf(list, params) {
  const size = Number(params.get('size')) || 10;
  const page = Number(params.get('page')) || 0;
  return {
    content: list.slice(page * size, page * size + size),
    page: { number: page, size, totalElements: list.length, totalPages: Math.ceil(list.length / size) },
  };
}

function aiQuestions(idCaso, body) {
  const types = body.distribuicao?.length ? body.distribuicao.map((item) => item.tipo) : [body.tipo || 'MULTIPLA_ESCOLHA'];
  const quantity = body.distribuicao?.length ? body.distribuicao.reduce((sum, item) => sum + item.quantidade, 0) : Number(body.quantidade) || 1;
  const level = { BAIXA: 'fácil', MEDIA: 'intermediária', ALTA: 'difícil' }[body.nivelDificuldade] || 'do caso';
  const created = Array.from({ length: quantity }, (_, index) => {
    const tipo = types[index % types.length];
    const base = { id: nextId(), idCaso, tipo };
    if (tipo === 'MULTIPLA_ESCOLHA') {
      return {
        ...base,
        texto: `(Dificuldade ${level}) Qual é a conduta inicial mais adequada para este paciente?`,
        alternativas: ['Solicitar ECG e iniciar monitorização', 'Alta com analgésico', 'Aguardar exames eletivos', 'Iniciar antibiótico empírico']
          .map((texto, i) => ({ id: nextId(), letra: 'ABCD'[i], texto, correta: i === 0 })),
        gabarito: 'A',
        resposta: 'Dor torácica típica exige ECG precoce e monitorização.',
      };
    }
    if (tipo === 'VERDADEIRO_FALSO') {
      return { ...base, texto: `(Dificuldade ${level}) O repouso costuma aliviar a dor da angina estável.`, alternativas: [], gabarito: 'VERDADEIRO', resposta: 'É característica da angina estável.' };
    }
    return {
      ...base,
      texto: `(Dificuldade ${level}) Descreva a conduta inicial e justifique cada etapa.`,
      alternativas: [],
      resposta: 'Monitorização, ECG em até 10 minutos e AAS na ausência de contraindicação.',
      rubrica: {
        criteriosEssenciais: ['Solicitar ECG de 12 derivações em até 10 minutos'],
        errosGraves: ['Atrasar a reperfusão para aguardar marcadores'],
      },
    };
  });
  db.perguntas.push(...created);
  return created;
}

export async function handlePreviewRequest(path, { method = 'GET', body } = {}) {
  const url = new URL(path, 'http://preview.local');
  const route = url.pathname;
  let match;

  if (method === 'POST' && route === '/auth/login') { await wait(400); return authResponse(body?.username); }
  if (method === 'GET' && route === '/auth/demonstracao') return { cadastroHabilitado: true, validadeHoras: 72 };
  if (method === 'POST' && route === '/auth/demonstracao/cadastro') { await wait(500); return authResponse(body?.email); }

  if ((match = route.match(/^\/professores\/\d+$/))) {
    if (method === 'PUT') { Object.assign(professor, body); return professor; }
    return professor;
  }
  if (/^\/professores\/\d+\/relatorio-desempenho$/.test(route)) return { totalPendentesRevisao: 3 };
  if (/^\/professores\/\d+\/casos$/.test(route)) return pageOf([...db.casos].reverse(), url.searchParams);

  if (route === '/casos' && method === 'GET') {
    let list = [...db.casos];
    const status = url.searchParams.get('status');
    const term = (url.searchParams.get('termo') || '').toLowerCase();
    if (status) list = list.filter((item) => item.status === status);
    else if (url.searchParams.get('incluirArquivados') === 'false') list = list.filter((item) => item.status !== 'ARQUIVADO');
    if (term) list = list.filter((item) => item.titulo.toLowerCase().includes(term));
    return pageOf(list.sort((a, b) => b.idCaso - a.idCaso), url.searchParams);
  }
  if (route === '/casos' && method === 'POST') {
    const created = { ...body, idCaso: nextId(), idProfessor: PROFESSOR_ID, status: body.status || 'RASCUNHO', dataCriacao: now() };
    db.casos.push(created);
    return created;
  }
  if ((match = route.match(/^\/casos\/(\d+)\/completo$/))) { const id = Number(match[1]); if (!db.casos.some((c) => c.idCaso === id)) notFound(); return complete(id); }
  if ((match = route.match(/^\/casos\/(\d+)\/perguntas\/lote$/))) {
    const idCaso = Number(match[1]);
    return (body.perguntas || []).map(({ id, pergunta }) => {
      const existing = db.perguntas.find((item) => item.id === id);
      const saved = {
        ...pergunta, id: id || nextId(), idCaso,
        alternativas: (pergunta.alternativas || []).map((alt) => ({ ...alt, id: alt.id || nextId() })),
      };
      if (existing) Object.assign(existing, saved); else db.perguntas.push(saved);
      return saved;
    });
  }
  if ((match = route.match(/^\/casos\/(\d+)\/perguntas$/))) {
    const idCaso = Number(match[1]);
    if (method === 'POST') { const saved = { ...body, id: nextId(), idCaso }; db.perguntas.push(saved); return saved; }
    return db.perguntas.filter((item) => item.idCaso === idCaso);
  }
  if ((match = route.match(/^\/casos\/(\d+)\/ia\/perguntas\/gerar$/))) { await wait(1800); return aiQuestions(Number(match[1]), body || {}); }
  if ((match = route.match(/^\/casos\/(\d+)\/ia\/(gerar|ajustar)$/))) {
    await wait(2200);
    const idCaso = Number(match[1]);
    let content = db.conteudos.filter((item) => item.idCaso === idCaso).at(-1);
    const fields = { ...sampleContent };
    ['sintomas', 'contexto', 'examClinico', 'antecClinico', 'diagEsperado'].forEach((key) => { if (body?.[key]) fields[key] = body[key]; });
    if (content) Object.assign(content, fields); else { content = { idConteudo: nextId(), idCaso, ...fields }; db.conteudos.push(content); }
    if (!db.pacientes.some((item) => item.idCaso === idCaso)) {
      db.pacientes.push({ idPaciente: nextId(), idCaso, nome: 'Paciente simulado', idade: 58, sexo: 'FEMININO', estadoCivil: 'CASADO', profissao: 'Professora', peso: '72 kg', altura: '1,65 m' });
    }
    return { idCaso, idConteudo: content.idConteudo, completo: complete(idCaso) };
  }
  if ((match = route.match(/^\/casos\/(\d+)\/(arquivar|publicar)$/))) {
    const item = db.casos.find((c) => c.idCaso === Number(match[1])) || notFound();
    item.status = match[2] === 'arquivar' ? 'ARQUIVADO' : 'PUBLICADO';
    return item;
  }
  if ((match = route.match(/^\/casos\/(\d+)$/))) {
    const id = Number(match[1]);
    const item = db.casos.find((c) => c.idCaso === id) || notFound();
    if (method === 'DELETE') { db.casos = db.casos.filter((c) => c.idCaso !== id); return null; }
    if (method === 'PUT') return Object.assign(item, body);
    return item;
  }

  if (route === '/pacientes' && method === 'POST') { const saved = { ...body, idPaciente: nextId() }; db.pacientes.push(saved); return saved; }
  if ((match = route.match(/^\/pacientes\/(\d+)$/))) { const item = db.pacientes.find((p) => p.idPaciente === Number(match[1])) || notFound(); return Object.assign(item, body); }
  if (route === '/conteudos' && method === 'POST') { const saved = { ...body, idConteudo: nextId() }; db.conteudos.push(saved); return saved; }
  if ((match = route.match(/^\/conteudos\/(\d+)$/))) { const item = db.conteudos.find((c) => c.idConteudo === Number(match[1])) || notFound(); return Object.assign(item, body); }
  if ((match = route.match(/^\/perguntas\/(\d+)$/))) {
    const id = Number(match[1]);
    if (method === 'DELETE') { db.perguntas = db.perguntas.filter((q) => q.id !== id); return null; }
    const item = db.perguntas.find((q) => q.id === id) || notFound();
    return Object.assign(item, body);
  }
  return method === 'GET' ? notFound() : null;
}
