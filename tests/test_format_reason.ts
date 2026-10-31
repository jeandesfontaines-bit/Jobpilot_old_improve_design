import { formatReason } from '../src/lib/formatReason';

function testFormatReason() {
  console.log('Running test_format_reason...');

  const c1 = formatReason('salary_min:130000');
  console.log('c1:', c1);
  if (!c1.includes('Salaire annoncé')) throw new Error(`Failed c1: ${c1}`);

  const c2 = formatReason('Canton non retenu (VS) — autorisés : GE, VD');
  console.log('c2:', c2);
  if (c2 !== 'Canton non retenu (VS) — autorisés : GE, VD') throw new Error(`Failed c2: ${c2}`);

  const c3 = formatReason('Exclu par la règle : « Comptable »');
  console.log('c3:', c3);
  if (c3 !== 'Exclu par la règle : « Comptable »') throw new Error(`Failed c3: ${c3}`);

  const c4 = formatReason('canton:VS');
  console.log('c4:', c4);
  if (c4 !== 'Canton non retenu (VS)') throw new Error(`Failed c4: ${c4}`);

  const c5 = formatReason('');
  console.log('c5:', c5);
  if (c5 !== '') throw new Error(`Failed c5: ${c5}`);

  console.log('All formatReason tests passed successfully!');
}

testFormatReason();
