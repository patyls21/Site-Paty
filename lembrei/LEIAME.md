# Lembrei! 🔔

App separado (dentro deste repositório) que manda mensagens de WhatsApp na hora certa: lembretes que se repetem
(ex.: banho do cachorro a cada 15 dias, avisando na véspera às 20h e no dia às 8h) ou mensagens avulsas agendadas.

**Como funciona**
- `lembrei/index.html` é o app (roxo, instalável no celular). Ele grava os lembretes em `lembrei/data/lembretes.json` pela API do GitHub.
- `.github/workflows/lembrei.yml` roda a cada 10 min, vê o que está na hora e envia (`lembrei/enviar.mjs`). O que já saiu fica em `data/estado.json`.
- O repositório é público: **nenhum telefone fica nele**, só os nomes ("Mãe", "Pai"). Os telefones ficam num Secret.
- O workflow só roda a partir da branch `main`: faça o merge desta branch.

## Configuração (uma vez)

### 1. WhatsApp (escolha um)
**CallMeBot — grátis, mais simples (não oficial).** Cada pessoa que vai receber precisa autorizar uma vez:
no site https://www.callmebot.com/blog/free-api-whatsapp-messages/ está o número do bot; a pessoa manda
`I allow callmebot to send me messages` e recebe de volta uma *apikey*. Por isso a mãe e o pai fazem isso no WhatsApp deles.

**API oficial da Meta (WhatsApp Cloud API)** — manda para qualquer número, mas exige conta Meta Business e, fora da janela de 24h,
um *template* aprovado. Defina a variável `WHATSAPP_PROVIDER=meta`, os Secrets `META_PHONE_ID`, `META_TOKEN` e a variável `META_TEMPLATE`
(template com 1 parâmetro no corpo).

### 2. Secret com os telefones
GitHub › Settings › Secrets and variables › Actions › **New repository secret** `LEMBREI_CONTATOS`:
```json
{"Mãe":{"telefone":"5511999999999","apikey":"123456"},"Pai":{"telefone":"5511888888888","apikey":"654321"}}
```
(telefone com 55 + DDD, só números; `apikey` só no CallMeBot). Os nomes precisam ser iguais aos cadastrados no app.

### 3. Token para o app gravar
GitHub › Settings › Developer settings › Fine-grained tokens › só este repositório, permissões **Contents: Read and write** e **Actions: Read and write**.
No app: ⚙ › cole o token (fica só naquele aparelho) › cadastre as pessoas › **Enviar teste…**.

### 4. Abrir o app
Pelo GitHub Pages do site: `…/lembrei/`. No celular: menu do navegador › Adicionar à tela inicial.

## Observações
- O GitHub pode atrasar o agendador alguns minutos; avisos atrasados até 12h ainda saem.
- Horário usado: Brasília (-03:00).
- Teste local da lógica: `node -e "import('./lembrei/logica.mjs').then(m=>console.log(m.hojeLocal()))"`.
