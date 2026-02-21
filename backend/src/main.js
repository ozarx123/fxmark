
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('FXMARK Backend Running');
});

app.get('/finance/ledger', (req, res) => {
  res.json({ message: 'Finance ledger endpoint' });
});

app.post('/finance/journal', (req, res) => {
  res.json({ message: 'Journal entry created (double-entry required)' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
