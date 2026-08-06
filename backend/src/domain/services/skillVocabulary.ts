import { normalizeText, squashText } from './textMatching.js';

/**
 * Recognized technology vocabulary for resume↔job matching.
 *
 * Plain token overlap cannot tell "Kubernetes" from "collaborate": both are
 * words a job description contains, only one says whether the candidate can do
 * the job. Naming the skills explicitly is what makes a score defensible, and
 * aliases absorb the spelling drift between postings ("Node.js" / "NodeJS" /
 * "node js") and resumes.
 *
 * `family` grants partial credit for adjacent tools — a React developer is a
 * plausible Angular hire, so those postings should rank above unrelated ones
 * instead of scoring the same as a Fortran role.
 */
export interface SkillDefinition {
  /** Stable key used for deduplication. */
  id: string;
  /** Human-facing name shown in matched/missing skill lists. */
  label: string;
  /** Spellings to search for, including the label itself. */
  aliases: string[];
  family?: string;
}

export const SKILL_VOCABULARY: SkillDefinition[] = [
  // Languages
  { id: 'typescript', label: 'TypeScript', aliases: ['typescript', 'ts'], family: 'js-lang' },
  {
    id: 'javascript',
    label: 'JavaScript',
    aliases: ['javascript', 'java script', 'es6', 'ecmascript'],
    family: 'js-lang',
  },
  { id: 'python', label: 'Python', aliases: ['python'], family: 'backend-lang' },
  { id: 'java', label: 'Java', aliases: ['java'], family: 'backend-lang' },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kotlin'], family: 'backend-lang' },
  { id: 'scala', label: 'Scala', aliases: ['scala'], family: 'backend-lang' },
  { id: 'golang', label: 'Go', aliases: ['golang', 'go lang'], family: 'backend-lang' },
  { id: 'ruby', label: 'Ruby', aliases: ['ruby'], family: 'backend-lang' },
  { id: 'php', label: 'PHP', aliases: ['php'], family: 'backend-lang' },
  { id: 'csharp', label: 'C#', aliases: ['c#', 'csharp', 'c sharp'], family: 'dotnet' },
  { id: 'cpp', label: 'C++', aliases: ['c++', 'cpp'], family: 'systems-lang' },
  { id: 'rust', label: 'Rust', aliases: ['rust'], family: 'systems-lang' },
  { id: 'swift', label: 'Swift', aliases: ['swift'], family: 'mobile' },
  { id: 'objectivec', label: 'Objective-C', aliases: ['objective c', 'objectivec'], family: 'mobile' },
  { id: 'dart', label: 'Dart', aliases: ['dart'], family: 'mobile' },
  // Same family as the engines, so naming any of them earns partial credit.
  { id: 'sql', label: 'SQL', aliases: ['sql'], family: 'rdbms' },
  { id: 'bash', label: 'Shell scripting', aliases: ['bash', 'shell scripting', 'shell script'] },

  // Frontend
  { id: 'react', label: 'React', aliases: ['react', 'react.js', 'reactjs'], family: 'frontend-framework' },
  { id: 'nextjs', label: 'Next.js', aliases: ['next.js', 'nextjs'], family: 'frontend-framework' },
  { id: 'angular', label: 'Angular', aliases: ['angular', 'angularjs'], family: 'frontend-framework' },
  { id: 'vue', label: 'Vue.js', aliases: ['vue', 'vue.js', 'vuejs'], family: 'frontend-framework' },
  { id: 'svelte', label: 'Svelte', aliases: ['svelte', 'sveltekit'], family: 'frontend-framework' },
  { id: 'redux', label: 'Redux', aliases: ['redux', 'redux toolkit'], family: 'frontend-state' },
  { id: 'reactquery', label: 'React Query', aliases: ['react query', 'tanstack query'], family: 'frontend-state' },
  { id: 'html', label: 'HTML', aliases: ['html', 'html5'], family: 'markup' },
  // No bare "less": the CSS preprocessor shares its name with a common word.
  { id: 'css', label: 'CSS', aliases: ['css', 'css3', 'scss', 'sass'], family: 'markup' },
  { id: 'tailwind', label: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss'], family: 'markup' },
  { id: 'webpack', label: 'Webpack', aliases: ['webpack'], family: 'bundler' },
  { id: 'vite', label: 'Vite', aliases: ['vite'], family: 'bundler' },
  { id: 'reactnative', label: 'React Native', aliases: ['react native'], family: 'mobile' },
  { id: 'flutter', label: 'Flutter', aliases: ['flutter'], family: 'mobile' },
  { id: 'android', label: 'Android', aliases: ['android'], family: 'mobile' },
  { id: 'ios', label: 'iOS', aliases: ['ios'], family: 'mobile' },
  { id: 'accessibility', label: 'Accessibility', aliases: ['accessibility', 'wcag', 'a11y'] },

  // Backend / API
  { id: 'node', label: 'Node.js', aliases: ['node.js', 'nodejs', 'node js', 'node'], family: 'node-runtime' },
  { id: 'express', label: 'Express', aliases: ['express', 'express.js', 'expressjs'], family: 'node-framework' },
  { id: 'nestjs', label: 'NestJS', aliases: ['nestjs', 'nest.js'], family: 'node-framework' },
  { id: 'spring', label: 'Spring Boot', aliases: ['spring', 'spring boot', 'springboot'], family: 'jvm-framework' },
  { id: 'django', label: 'Django', aliases: ['django'], family: 'python-framework' },
  { id: 'flask', label: 'Flask', aliases: ['flask'], family: 'python-framework' },
  { id: 'fastapi', label: 'FastAPI', aliases: ['fastapi', 'fast api'], family: 'python-framework' },
  { id: 'dotnet', label: '.NET', aliases: ['.net', 'dotnet', 'asp.net', 'aspnet'], family: 'dotnet' },
  { id: 'rails', label: 'Ruby on Rails', aliases: ['rails', 'ruby on rails'], family: 'ruby-framework' },
  // "rest" alone is an English word — only the qualified forms are a signal.
  {
    id: 'rest',
    label: 'REST APIs',
    aliases: ['restful', 'rest api', 'rest apis', 'rest services', 'rest web services'],
    family: 'api',
  },
  { id: 'graphql', label: 'GraphQL', aliases: ['graphql', 'apollo'], family: 'api' },
  { id: 'grpc', label: 'gRPC', aliases: ['grpc', 'protobuf', 'protocol buffers'], family: 'api' },
  { id: 'websocket', label: 'WebSockets', aliases: ['websocket', 'websockets', 'socket.io'], family: 'api' },
  { id: 'microservices', label: 'Microservices', aliases: ['microservice', 'microservices'], family: 'architecture' },
  {
    id: 'eventdriven',
    label: 'Event-driven architecture',
    aliases: ['event driven', 'event sourcing', 'pub sub', 'publish subscribe'],
    family: 'architecture',
  },
  { id: 'ddd', label: 'Domain-driven design', aliases: ['domain driven design', 'ddd'], family: 'architecture' },

  // Data stores
  { id: 'postgres', label: 'PostgreSQL', aliases: ['postgres', 'postgresql'], family: 'rdbms' },
  { id: 'mysql', label: 'MySQL', aliases: ['mysql', 'mariadb'], family: 'rdbms' },
  { id: 'sqlserver', label: 'SQL Server', aliases: ['sql server', 'mssql'], family: 'rdbms' },
  { id: 'oracledb', label: 'Oracle DB', aliases: ['oracle db', 'oracle database', 'pl sql', 'plsql'], family: 'rdbms' },
  { id: 'sqlite', label: 'SQLite', aliases: ['sqlite'], family: 'rdbms' },
  { id: 'mongodb', label: 'MongoDB', aliases: ['mongodb', 'mongo'], family: 'nosql' },
  { id: 'dynamodb', label: 'DynamoDB', aliases: ['dynamodb'], family: 'nosql' },
  { id: 'cassandra', label: 'Cassandra', aliases: ['cassandra', 'scylla'], family: 'nosql' },
  { id: 'redis', label: 'Redis', aliases: ['redis', 'memcached'], family: 'cache' },
  { id: 'elasticsearch', label: 'Elasticsearch', aliases: ['elasticsearch', 'opensearch', 'elk'], family: 'search' },
  { id: 'prisma', label: 'Prisma', aliases: ['prisma'], family: 'orm' },
  { id: 'orm', label: 'ORM', aliases: ['orm', 'sequelize', 'typeorm', 'hibernate', 'sqlalchemy'], family: 'orm' },
  { id: 'snowflake', label: 'Snowflake', aliases: ['snowflake', 'bigquery', 'redshift'], family: 'warehouse' },

  // Cloud / infra
  { id: 'aws', label: 'AWS', aliases: ['aws', 'amazon web services'], family: 'cloud' },
  { id: 'azure', label: 'Azure', aliases: ['azure'], family: 'cloud' },
  { id: 'gcp', label: 'GCP', aliases: ['gcp', 'google cloud'], family: 'cloud' },
  { id: 'docker', label: 'Docker', aliases: ['docker', 'containers', 'containerization'], family: 'containers' },
  { id: 'kubernetes', label: 'Kubernetes', aliases: ['kubernetes', 'k8s', 'eks', 'aks', 'gke'], family: 'containers' },
  { id: 'terraform', label: 'Terraform', aliases: ['terraform', 'infrastructure as code'], family: 'iac' },
  // Not bare "lambda", which Java postings use for lambda expressions.
  { id: 'serverless', label: 'Serverless', aliases: ['serverless', 'aws lambda'], family: 'cloud' },
  { id: 'cicd', label: 'CI/CD', aliases: ['ci cd', 'cicd', 'continuous integration', 'continuous delivery'], family: 'devops' },
  { id: 'jenkins', label: 'Jenkins', aliases: ['jenkins'], family: 'devops' },
  { id: 'githubactions', label: 'GitHub Actions', aliases: ['github actions', 'gitlab ci', 'circleci'], family: 'devops' },
  { id: 'git', label: 'Git', aliases: ['git', 'github', 'gitlab', 'bitbucket', 'version control'] },
  { id: 'linux', label: 'Linux', aliases: ['linux', 'unix'] },
  // Not bare "apache", which prefixes Kafka, Spark and half the ecosystem.
  { id: 'nginx', label: 'Nginx', aliases: ['nginx', 'apache http', 'httpd', 'apache tomcat', 'tomcat'] },
  { id: 'observability', label: 'Observability', aliases: ['observability', 'monitoring', 'datadog', 'grafana', 'prometheus', 'new relic'] },

  // Messaging / streaming
  { id: 'kafka', label: 'Kafka', aliases: ['kafka'], family: 'messaging' },
  { id: 'rabbitmq', label: 'RabbitMQ', aliases: ['rabbitmq', 'sqs', 'activemq'], family: 'messaging' },
  // Qualified forms only — "spark" is a staple of recruiting copy.
  {
    id: 'spark',
    label: 'Apache Spark',
    aliases: ['apache spark', 'pyspark', 'spark sql', 'spark streaming', 'hadoop'],
    family: 'bigdata',
  },
  { id: 'airflow', label: 'Airflow', aliases: ['airflow', 'dbt'], family: 'bigdata' },
  { id: 'etl', label: 'ETL', aliases: ['etl', 'data pipeline', 'data pipelines'], family: 'bigdata' },

  // Testing / quality
  { id: 'unittesting', label: 'Unit testing', aliases: ['unit testing', 'unit tests', 'tdd'], family: 'testing' },
  { id: 'jest', label: 'Jest', aliases: ['jest', 'vitest', 'mocha', 'jasmine'], family: 'testing' },
  { id: 'cypress', label: 'Cypress', aliases: ['cypress', 'playwright', 'selenium'], family: 'testing' },
  { id: 'junit', label: 'JUnit', aliases: ['junit', 'pytest', 'testng'], family: 'testing' },

  // AI / ML
  { id: 'ml', label: 'Machine learning', aliases: ['machine learning', 'deep learning', 'neural networks'], family: 'ml' },
  { id: 'llm', label: 'LLMs', aliases: ['llm', 'llms', 'large language model', 'generative ai', 'genai'], family: 'ml' },
  { id: 'pytorch', label: 'PyTorch', aliases: ['pytorch', 'tensorflow', 'keras'], family: 'ml' },
  { id: 'pandas', label: 'Pandas', aliases: ['pandas', 'numpy', 'scikit learn', 'sklearn'], family: 'ml' },

  // Practices
  { id: 'agile', label: 'Agile', aliases: ['agile', 'scrum', 'kanban'] },
  { id: 'systemdesign', label: 'System design', aliases: ['system design', 'distributed systems', 'scalability'], family: 'architecture' },
  { id: 'security', label: 'Security', aliases: ['security', 'oauth', 'authentication', 'authorization', 'jwt'] },
  { id: 'performance', label: 'Performance optimization', aliases: ['performance optimization', 'performance tuning', 'latency'] },
  { id: 'codereview', label: 'Code review', aliases: ['code review', 'code reviews', 'mentoring'] },
];

/**
 * Words that appear in nearly every posting and therefore carry no matching
 * signal. Kept deliberately broad: an unfiltered token list scores boilerplate
 * ("responsibilities", "team", "candidate") as if it were a requirement.
 */
export const STOPWORDS = new Set([
  // Grammar
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'that',
  'this', 'have', 'has', 'from', 'not', 'all', 'any', 'can', 'but', 'who',
  'how', 'its', 'their', 'they', 'them', 'than', 'then', 'into', 'out', 'over',
  'under', 'more', 'most', 'less', 'also', 'such', 'been', 'being', 'was',
  'were', 'use', 'using', 'used', 'via', 'per', 'etc', 'may', 'must', 'should',
  'would', 'could', 'shall', 'about', 'among', 'because', 'before', 'after',
  'while', 'when', 'where', 'which', 'what', 'whose', 'each', 'every', 'other',
  'others', 'some', 'many', 'much', 'both', 'either', 'neither', 'within',
  'without', 'upon', 'onto', 'off', 'only', 'very', 'well', 'however',
  'additionally', 'furthermore', 'please', 'note', 'across', 'make', 'makes',
  'making', 'take', 'takes', 'taking', 'get', 'gets', 'give', 'gives',
  // Evaluative filler
  'best', 'better', 'good', 'great', 'strong', 'solid', 'proven', 'excellent',
  'ability', 'able', 'nice', 'desired', 'preferred', 'plus', 'relevant',
  'related', 'high', 'low', 'new', 'existing', 'multiple', 'various',
  'dynamic', 'fast', 'paced', 'world', 'class', 'global', 'leader', 'leading',
  'passion', 'passionate', 'motivated', 'driven',
  // Posting boilerplate
  'skills', 'skill', 'experience', 'experienced', 'experiences', 'years',
  'year', 'work', 'working', 'works', 'worker', 'job', 'jobs', 'role', 'roles',
  'position', 'positions', 'opportunity', 'opportunities', 'career', 'careers',
  'team', 'teams', 'teamwork', 'company', 'companies', 'business',
  'businesses', 'organization', 'organizations', 'client', 'clients',
  'customer', 'customers', 'stakeholder', 'stakeholders', 'partner',
  'partners', 'vendor', 'vendors', 'candidate', 'candidates', 'applicant',
  'applicants', 'employee', 'employees', 'employer', 'employment', 'hiring',
  'hire', 'recruiter', 'recruiting', 'recruitment', 'requirement',
  'requirements', 'required', 'require', 'requires', 'responsibility',
  'responsibilities', 'responsible', 'qualification', 'qualifications',
  'qualified', 'description', 'descriptions', 'summary', 'overview', 'details',
  'detail', 'detailed', 'including', 'include', 'includes', 'included',
  // Generic verbs
  'ensure', 'ensuring', 'ensures', 'support', 'supporting', 'supports',
  'provide', 'providing', 'provides', 'provided', 'deliver', 'delivering',
  'delivers', 'delivery', 'develop', 'developing', 'develops', 'development',
  'design', 'designing', 'designs', 'build', 'building', 'builds', 'built',
  'create', 'creating', 'creates', 'created', 'implement', 'implementing',
  'implements', 'implementation', 'maintain', 'maintaining', 'maintains',
  'maintenance', 'manage', 'managing', 'manages', 'management', 'improve',
  'improving', 'improves', 'improvement', 'drive', 'driving', 'drives',
  'lead', 'leads', 'leadership', 'collaborate', 'collaborating',
  'collaboration', 'collaborative', 'communicate', 'communicating',
  'communication', 'communications', 'coordinate', 'coordinating',
  'participate', 'participating', 'contribute', 'contributing', 'help',
  'helping', 'helps', 'join', 'joining', 'looking', 'look', 'seeking', 'seek',
  'seeks', 'apply', 'applying', 'application', 'applications',
  // Generic nouns
  'environment', 'environments', 'culture', 'values', 'value', 'mission',
  'vision', 'industry', 'industries', 'technology', 'technologies',
  'technical', 'technically', 'engineering', 'engineer', 'engineers',
  'solution', 'solutions', 'product', 'products', 'project', 'projects',
  'process', 'processes', 'practice', 'practices', 'standard', 'standards',
  'quality', 'level', 'levels', 'end', 'ends', 'full', 'time', 'times',
  'part', 'day', 'daily', 'week', 'weekly', 'month', 'monthly', 'annual',
  // Benefits / legal / EEO
  'salary', 'benefits', 'insurance', 'equity', 'bonus', 'paid', 'leave',
  'remote', 'hybrid', 'onsite', 'office', 'location', 'locations', 'based',
  'india', 'usa', 'united', 'states', 'equal', 'diversity', 'inclusion',
  'inclusive', 'gender', 'race', 'religion', 'disability', 'veteran',
  'status', 'law', 'legal', 'policy', 'compliance', 'regulatory',
  // Education / proficiency
  'knowledge', 'understanding', 'understand', 'familiar', 'familiarity',
  'expertise', 'expert', 'deep', 'broad', 'hands', 'proficiency',
  'proficient', 'competency', 'fluent', 'minimum', 'maximum', 'least',
  'degree', 'bachelor', 'bachelors', 'master', 'masters', 'phd', 'computer',
  'science', 'field', 'equivalent', 'discipline', 'university', 'college',
  'education', 'educational', 'certification', 'certifications',
]);

/** Tokens that describe seniority, job codes or place rather than capability. */
export const TITLE_NOISE = new Set([
  'senior', 'sr', 'junior', 'jr', 'staff', 'principal', 'lead', 'associate',
  'assistant', 'head', 'chief', 'director', 'manager', 'intern', 'internship',
  'trainee', 'graduate', 'entry', 'mid', 'level', 'ii', 'iii', 'iv', 'one',
  'two', 'three', 'engineer', 'engineering', 'developer', 'development',
  'specialist', 'analyst', 'consultant', 'architect', 'professional', 'expert',
  'member', 'technical', 'remote', 'hybrid', 'onsite', 'india', 'hyderabad',
  'bangalore', 'bengaluru', 'pune', 'chennai', 'mumbai', 'delhi', 'noida',
  'gurgaon', 'gurugram',
  // Words nearly every engineering title contains, plus the org and team names
  // boards append to them — present in any resume, so they separate nothing.
  'software', 'systems', 'system', 'solution', 'solutions', 'application',
  'applications', 'platform', 'platforms', 'technology', 'technologies',
  'digital', 'group', 'groups', 'team', 'teams', 'center', 'centre', 'global',
  'service', 'services', 'business', 'operations', 'product', 'products',
]);

export interface TextIndex {
  normalized: string;
  squashed: string;
}

/** Precomputes both lookup forms once, since resumes are matched against many jobs. */
export function buildTextIndex(text: string): TextIndex {
  return { normalized: normalizeText(text), squashed: squashText(text) };
}

/**
 * Whole-word alias lookup, with a separator-insensitive retry for aliases that
 * contain punctuation or spaces ("node.js" also finds "nodejs"). The retry is
 * restricted to those aliases on purpose: squashing everything would make
 * "java" match inside "javascript".
 */
export function indexHasTerm(index: TextIndex, term: string): boolean {
  const phrase = normalizeText(term).trim();
  if (phrase && index.normalized.includes(` ${phrase} `)) {
    return true;
  }
  if (!/[^a-z0-9]/i.test(term.trim())) {
    return false;
  }
  const joined = squashText(term);
  return joined.length >= 4 && index.squashed.includes(joined);
}

export function skillPresent(index: TextIndex, skill: SkillDefinition): boolean {
  return skill.aliases.some((alias) => indexHasTerm(index, alias));
}

/** Every vocabulary skill named anywhere in the given text. */
export function findSkills(text: string | null | undefined): SkillDefinition[] {
  if (!text?.trim()) {
    return [];
  }
  const index = buildTextIndex(text);
  return SKILL_VOCABULARY.filter((skill) => skillPresent(index, skill));
}

/**
 * Meaningful words in a block of text: stopwords, pure numbers and short
 * fragments removed, so the remainder is mostly domain vocabulary.
 */
export function contentTokens(
  text: string | null | undefined,
  extraNoise?: Set<string>,
): Set<string> {
  const tokens = new Set<string>();
  if (!text?.trim()) {
    return tokens;
  }
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#.]+/i)) {
    const token = raw.replace(/^\.+|\.+$/g, '').trim();
    if (token.length < 3 || /^[0-9.]+$/.test(token)) {
      continue;
    }
    if (STOPWORDS.has(token) || extraNoise?.has(token)) {
      continue;
    }
    tokens.add(token);
  }
  return tokens;
}
