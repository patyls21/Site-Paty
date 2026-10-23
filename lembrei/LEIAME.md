# Lembrei! 🔔 (app Android)

Lembretes que se repetem (a cada N dias/semanas/meses, ou em dias da semana, ex.: segunda e quarta; ex.: banho do cachorro a cada 15 dias, avisando na véspera às 20h e no dia às 8h) ou mensagens agendadas.
Na hora certa o celular **toca e vibra como um alarme** (som de alarme que repete até você mexer, tela acesa mesmo bloqueada, botões Abrir WhatsApp / Adiar 10 min); ao tocar, abre o **seu** WhatsApp na conversa da pessoa com o texto pronto, e você só toca em enviar.
Para quem recebe, a mensagem vem do seu número, escrita por você.

- Tudo fica **só no seu aparelho** (lembretes e telefones). Não há painel web nem servidor, então ninguém mais consegue alterar nada.
- O app é montado pelo GitHub (`.github/workflows/lembrei.yml`) e publicado em Releases como `lembrei.apk`.
- Regras de data/horário: `lembrei/app/src/main/assets/logica.mjs` (testes: `node --test lembrei/teste.mjs`).

## Instalar
1. No celular, abra a página de Releases do repositório e baixe `lembrei.apk` (release **App Lembrei!**).
2. Instale (permita “instalar de fontes desconhecidas” para o navegador, se pedir).
3. Abra o app, aceite as notificações, vá em ⚙ e cadastre as pessoas (nome + WhatsApp com DDD).
4. Em ⚙ › **Alarme na tela bloqueada** (Android 14+: ligar a permissão) e **Ajustes de bateria**, marque o Lembrei! como “Sem restrições” (no Samsung: Bateria › Limites de uso em segundo plano › tirar das apps em suspensão). Use **Testar aviso** para conferir.

## Limites
- Não envia sozinho: pede o seu toque (o WhatsApp não permite envio automático sem recursos de acessibilidade).
- O celular precisa estar ligado. Avisos que passaram com ele desligado aparecem ao ligar (até 12h depois).
- O app programa 90 dias à frente; abra-o de vez em quando. Perto do fim ele avisa para renovar.
- Em ⚙ › **Como avisar** dá para escolher “Tocar e vibrar” ou “Só vibrar”.
- O som usa o volume de alarme do celular (e o alarme ignora o “não perturbe” se você permitir).
- Se limpar os dados do app, os lembretes somem.
