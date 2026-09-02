# ZR — versão no estilo original

Abra `ZR — Estética Automotiva em Guarujá — Google Agenda.html`. Esta é uma cópia da página original, com o mesmo visual e recursos, acrescida de:

- consulta e reserva pelo Google Agenda;
- PIX por telefone `+5513997113038` e cartão presencial;
- painel financeiro separado em `ZR-dashboard.html`;
- registro de reservas e valores no Google Sheets.

## Ativação

1. No Google Apps Script, crie um projeto e cole `Code.gs`.
2. Preencha `SPREADSHEET_ID`, `CALENDAR_ID` e `DASHBOARD_TOKEN`; execute `setup()` uma vez.
3. Publique como aplicativo da Web: **Implantar → Nova implantação → Aplicativo da Web**. Em “Quem tem acesso”, selecione a opção que permita acesso aos visitantes do site. Copie a URL terminada em `/exec` e cole-a no arquivo `zr-google-config.js`.
4. Hospede todos os arquivos e a pasta `ZR — Estética Automotiva em Guarujá_files` juntos.

Enquanto a URL estiver vazia, a agenda Firebase original continua em uso. Após configurada, a camada Google substitui o fluxo de reserva e registra o evento, a planilha e o PIX.

## Painel financeiro

Abra `ZR-dashboard.html` ou use o botão “Abrir painel financeiro” no modo dono do site. O painel pede o mesmo valor definido em `DASHBOARD_TOKEN`; ele não fica mais exposto no endereço da página. Use “Marcar pago” após confirmar um PIX recebido.

## Teste antes de divulgar

1. Faça uma reserva de teste em um dos horários.
2. Confira se ela apareceu no Google Agenda e na aba `Agendamentos` da planilha.
3. Abra o painel, informe o token e confirme se o agendamento e o valor aparecem.
4. Marque o PIX como pago e verifique a atualização da coluna `Status PIX` na planilha.
