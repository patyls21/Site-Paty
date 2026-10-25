import test from 'node:test';
import assert from 'node:assert/strict';
import { envios, ocorrencias, addMeses, textoAviso } from './app/src/main/assets/logica.mjs';

const banho = { id: 'a', titulo: 'Banho do cachorro', data: '2026-10-10', repete: { cada: 15, unidade: 'dias' }, avisos: [{ diasAntes: 1, hora: '20:00' }, { diasAntes: 0, hora: '08:00' }], para: ['Mãe'] };

test('repete a cada 15 dias', () => {
  assert.deepEqual(ocorrencias(banho, '2026-10-11', '2026-11-30'), ['2026-10-25', '2026-11-09', '2026-11-24']);
});
test('avisos: véspera 20h e dia 8h, horário de Brasília', () => {
  const e = envios([banho], '2026-10-25', '2026-10-25');
  assert.deepEqual(e.map(x => x.quando.toISOString()), ['2026-10-24T23:00:00.000Z', '2026-10-25T11:00:00.000Z']);
});
test('aviso da véspera de evento que cai logo depois do intervalo ainda entra', () => {
  assert.equal(envios([banho], '2026-10-24', '2026-10-24').length, 2);
});
test('mensal fixa no fim do mês', () => { assert.equal(addMeses('2026-01-31', 1), '2026-02-28'); });
test('texto padrão não cita o app', () => {
  assert.equal(textoAviso(banho, 1, '2026-10-25'), 'Amanhã: Banho do cachorro');
});

const seqQua = { id: 'b', titulo: 'Remédio', data: '2026-10-21', repete: { dias: [1, 3], cada: 1 }, avisos: [{ diasAntes: 0, hora: '08:00' }], para: ['Mãe'] };
test('toda segunda e quarta', () => {
  // 21/10/2026 é quarta
  assert.deepEqual(ocorrencias(seqQua, '2026-10-21', '2026-11-04'), ['2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04']);
});
test('dias da semana não começam antes da primeira data', () => {
  assert.deepEqual(ocorrencias(seqQua, '2026-10-01', '2026-10-25'), ['2026-10-21']);
});
test('segunda e quarta a cada 2 semanas', () => {
  const l = { ...seqQua, repete: { dias: [1, 3], cada: 2 } };
  assert.deepEqual(ocorrencias(l, '2026-10-21', '2026-11-12'), ['2026-10-21', '2026-11-02', '2026-11-04']);
});
test('dias da semana com data final', () => {
  assert.deepEqual(ocorrencias({ ...seqQua, fim: '2026-10-27' }, '2026-10-21', '2026-11-30'), ['2026-10-21', '2026-10-26']);
});
