# ZR Estética Automotiva

Projeto estático pronto para teste no GitHub Pages. A página inicial é `index.html`; ela abre automaticamente o site principal.

## Publicar no GitHub Pages

1. Crie um repositório vazio no GitHub.
2. Envie **todos** os arquivos desta pasta, inclusive a pasta `ZR — Estética Automotiva em Guarujá_files`.
3. No repositório, abra **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**, a branch `main` e a pasta `/(root)`; salve.
5. Aguarde a URL aparecer. Ela abrirá o `index.html` automaticamente.

O endereço público do site será seguro para testar em celular e computador. Não envie `Code.gs` para um repositório público se você não quiser expor os IDs de planilha e calendário; mantenha-o em um repositório privado ou fora do envio.

## Recursos

- consulta e reserva pelo Google Agenda;
- PIX por telefone `+5513997113038` e cartão presencial;
- painel financeiro separado em `ZR-dashboard.html`;
- registro de reservas e valores no Google Sheets.

## Ativação

1. No Google Apps Script, crie um projeto e cole `Code.gs`.
2. Preencha `SPREADSHEET_ID`, `CALENDAR_ID` e `DASHBOARD_TOKEN`; execute `setup()` uma vez.
3. Publique como aplicativo da Web: **Implantar → Nova implantação → Aplicativo da Web**. Em “Quem tem acesso”, selecione a opção que permita acesso aos visitantes do site. Copie a URL terminada em `/exec` e cole-a no arquivo `zr-google-config.js`.
4. Hospede todos os arquivos e a pasta `ZR — Estética Automotiva em Guarujá_files` juntos. No GitHub Pages, o `index.html` já resolve a abertura do site.

Enquanto a URL estiver vazia, a agenda Firebase original continua em uso. Após configurada, a camada Google substitui o fluxo de reserva e registra o evento, a planilha e o PIX.

## Painel financeiro

Abra `ZR-dashboard.html` ou use o botão “Abrir painel financeiro” no modo dono do site. O painel pede o mesmo valor definido em `DASHBOARD_TOKEN`; ele não fica mais exposto no endereço da página. Use “Marcar pago” após confirmar um PIX recebido.

## Teste antes de divulgar

1. Faça uma reserva de teste em um dos horários.
2. Confira se ela apareceu no Google Agenda e na aba `Agendamentos` da planilha.
3. Abra o painel, informe o token e confirme se o agendamento e o valor aparecem.
4. Marque o PIX como pago e verifique a atualização da coluna `Status PIX` na planilha.
