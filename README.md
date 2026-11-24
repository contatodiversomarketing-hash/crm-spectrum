# Ana

Contexto:
Estou criando um projeto chamado Core-IA-Clinica. Ele será a central inteligente que orquestra múltiplos sistemas já existentes (Gestão, CRM, Financeiro, Odonto, etc.) via APIs. Ele será responsável por atendimento WhatsApp, telefonia, automações e análises estratégicas.




Tarefa:
Criar estrutura inicial do banco para o Core IA.




Diretrizes:




Criar tabela configuracoes_sistema:
	•	id (UUID, PK)
	•	modo_supervisao_ativo (boolean)
	•	horario_inicio (time)
	•	horario_fim (time)
	•	dias_semana (texto)
	•	nivel_autonomia (integer 0-100)
	•	criado_em (timestamp default now)




Criar tabela interacoes_ia:
	•	id (UUID)
	•	paciente_externo_id (texto)
	•	sistema_origem (texto)
	•	canal (whatsapp, telefone)
	•	mensagem_usuario (texto)
	•	intencao_detectada (texto)
	•	estado_conversa (texto)
	•	resposta_sugerida (texto)
	•	resposta_final (texto)
	•	supervisionado (boolean)
	•	criado_em (timestamp)




Criar tabela memorias_ia:
	•	id
	•	paciente_externo_id
	•	resumo_contextual
	•	risco_classificacao
	•	preferencia_profissional
	•	ultima_interacao




Criar tabela logs_decisao:
	•	id
	•	evento
	•	dados_entrada (json)
	•	regra_aplicada
	•	decisao
	•	confianca
	•	criado_em




Criar tabela automacoes:
	•	id
	•	paciente_externo_id
	•	tipo
	•	sistema_alvo
	•	payload (json)
	•	status
	•	data_execucao
	•	criado_em




Ativar Row-Level Security em todas as tabelas.




Restrições:
	•	Não criar duplicação de dados clínicos.
	•	Core deve ser leve.
	•	Preparar estrutura para alto volume de interações.
	•	Criar índices nos campos paciente_externo_id e criado_em.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://crm-spectrum.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/cd1fe3de-6d57-4fe6-aa0b-7880b2117ee4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
