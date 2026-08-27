import { PrismaClient, Role } from '@prisma/client'
import { hash } from '@node-rs/argon2'

const prisma = new PrismaClient()

/**
 * Catálogo de habilidades do II Ciclo — PRD §4.
 *
 * ATENÇÃO: a quantidade de itens de cada habilidade NÃO é semeada, de
 * propósito. Ela nasce sempre da apuração sobre os dados importados
 * (FR-015, FR-016). Semear "22 itens" aqui seria exatamente o hardcode que a
 * constituição proíbe, e quebraria qualquer ciclo futuro com outra matriz.
 */
const HABILIDADES = [
  {
    shortCode: 'H01',
    referenceCode: '2EF08_P',
    ordem: 1,
    descricao:
      'Localizar informações explícitas em textos, recuperadas por meio de paráfrase.',
  },
  {
    shortCode: 'H02',
    referenceCode: '2EF14_P',
    ordem: 2,
    descricao:
      'Inferir o sentido de palavra ou expressão idiomática própria da linguagem informal, com base em pistas co-textuais, como sinonímia ou palavra do mesmo campo semântico.',
  },
  {
    shortCode: 'H03',
    referenceCode: '3EF17_P',
    ordem: 3,
    descricao: 'Reconhecer o gênero de um texto do campo da vida pública.',
  },
  {
    shortCode: 'H04',
    referenceCode: '4EF08_P',
    ordem: 4,
    descricao:
      'Reconhecer o assunto de notícias quando o assunto é apontado indiretamente pela manchete e/ou é tópico do primeiro parágrafo do texto.',
  },
  {
    shortCode: 'H05',
    referenceCode: '4EF10_P',
    ordem: 5,
    descricao:
      'Inferir informação em texto exclusivamente verbal com base numa paráfrase, na dedução a partir de um enunciado ou na conexão entre enunciados.',
  },
  {
    shortCode: 'H06',
    referenceCode: '4EF12_P',
    ordem: 6,
    descricao:
      'Inferir o sentido de palavra pouco usual ou expressão metafórica, com base em pistas co-textuais em textos de qualquer campo de atuação.',
  },
  {
    shortCode: 'H07',
    referenceCode: '4EF14_P',
    ordem: 7,
    descricao:
      'Inferir efeitos de humor em textos que conjugam linguagem verbal e não verbal.',
  },
  {
    shortCode: 'H08',
    referenceCode: '4EF16_P',
    ordem: 8,
    descricao:
      'Reconhecer o narrador em narrativas ficcionais, quando se trata do narrador em primeira pessoa.',
  },
  {
    shortCode: 'H09',
    referenceCode: '4EF19_P',
    ordem: 9,
    descricao:
      'Identificar a finalidade de textos do campo da vida pública, como cartazes de conscientização e regras de convivência.',
  },
  {
    shortCode: 'H10',
    referenceCode: '4EF22_P',
    ordem: 10,
    descricao:
      'Reconhecer relações lógico-discursivas de causalidade marcadas por conjunções mais usuais em textos do campo da vida cotidiana e do campo artístico-literário.',
  },
  {
    shortCode: 'H11',
    referenceCode: '4EF24_P',
    ordem: 11,
    descricao:
      'Identificar o referente de pronomes pessoais do caso reto, em relação anafórica com referente próximo, em textos do campo da vida cotidiana e artístico-literário.',
  },
  {
    shortCode: 'H12',
    referenceCode: '5EF04_P',
    ordem: 12,
    descricao:
      'Reconhecer o assunto de textos de qualquer campo de atuação quando o assunto é indicado indiretamente pelo título e/ou é tópico do primeiro parágrafo do texto.',
  },
] as const

async function main() {
  console.log('Semeando o catálogo de habilidades...')
  for (const h of HABILIDADES) {
    await prisma.skill.upsert({
      where: { shortCode: h.shortCode },
      update: {
        referenceCode: h.referenceCode,
        descricao: h.descricao,
        ordem: h.ordem,
      },
      create: { ...h },
    })
  }
  console.log(`  ${HABILIDADES.length} habilidades`)

  console.log('Criando o usuário administrador...')

  // A senha padrão existe para o primeiro `npm run db:seed` numa máquina de
  // desenvolvimento. Como este repositório é público, ela é uma credencial
  // CONHECIDA — e por isso o seed se recusa a usá-la fora de desenvolvimento.
  // Sem essa recusa, bastaria alguém implantar o sistema sem ler o README para
  // ficar com um administrador de senha pública sobre dados de crianças.
  const senhaInformada = process.env.SEED_ADMIN_PASSWORD
  if (!senhaInformada && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_ADMIN_PASSWORD é obrigatória fora de desenvolvimento.\n' +
        'A senha padrão do seed é pública — este repositório é aberto.\n' +
        'Defina uma senha própria antes de semear.',
    )
  }
  const senha = senhaInformada ?? 'admin-local-2026'
  const admin = await prisma.user.upsert({
    where: { email: 'admin@painel.local' },
    update: {},
    create: {
      email: 'admin@painel.local',
      name: 'Administrador',
      passwordHash: await hash(senha),
      role: Role.ADMIN,
      // FR-007: ADMIN recebe a permissão de dados nominais por padrão.
      canAccessNominalData: true,
    },
  })
  console.log(`  admin@painel.local / ${senha}`)

  console.log('Criando a escola de demonstração...')
  const escola = await prisma.school.upsert({
    where: { code: 'ESC-DEMO-001' },
    update: {},
    create: {
      code: 'ESC-DEMO-001',
      name: 'Escola Municipal de Demonstração',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RORAIMA',
    },
  })

  console.log('Criando a configuração analítica inicial...')
  const existente = await prisma.analyticalSettings.findFirst({
    orderBy: { version: 'desc' },
  })
  if (!existente) {
    await prisma.analyticalSettings.create({
      data: {
        version: 1,
        // Faixas sugeridas pelo PRD §10. São CONFIGURÁVEIS: nunca devem
        // aparecer fixas em código de aplicação (FR-111).
        fragilidadeMax: '60.00',
        atencaoMax: '80.00',
        baixoRendimento: ['DEFASAGEM'],
        abaixoDoAdequadoHabilitado: false,
        createdByUserId: admin.id,
      },
    })
    console.log('  versão 1: Fragilidade < 60%, Atenção 60–79,99%, Satisfatório >= 80%')
  } else {
    console.log(`  já existe (versão ${existente.version})`)
  }

  console.log('\nSeed concluído.')
  console.log(`  Escola de demonstração: ${escola.name}`)
  console.log('  Nenhum estudante ou resultado foi criado — eles vêm pela importação.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
