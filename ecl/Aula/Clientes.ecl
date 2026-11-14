IMPORT $;

// 12 clientes ficticios. Uso: IMPORT Aula;  OUTPUT(Aula.Clientes);
EXPORT Clientes := DATASET([
  { 1, 'Ana',   'Smith',    'FL', 'Miami',     19900315,  5200.00, 710},
  { 2, 'Bruno', 'Johnson',  'GA', 'Atlanta',   20081102,     0.00,   0},
  { 3, 'Carla', 'Williams', 'FL', 'Orlando',   19720830,  8300.50, 780},
  { 4, 'Diego', 'Brown',    'TX', 'Dallas',    19961201,  3900.00, 590},
  { 5, 'Elisa', 'Jones',    'GA', 'Savannah',  19540419,  2100.00, 640},
  { 6, 'Fabio', 'Garcia',   'TX', 'Houston',   19850607, 12500.00, 820},
  { 7, 'Gina',  'Miller',   'NY', 'Buffalo',   19990923,  4100.00, 480},
  { 8, 'Hugo',  'Davis',    'FL', 'Tampa',     19680111,  6700.00, 700},
  { 9, 'Iris',  'Martinez', 'CA', 'San Diego', 19930228,  9800.00, 760},
  {10, 'Joao',  'Lopez',    'GA', 'Atlanta',   19810714,  3100.00, 530},
  {11, 'Katia', 'Wilson',   'NY', 'New York',  19770505, 15200.00, 805},
  {12, 'Leo',   'Smith',    'FL', 'Miami',     20010909,  2800.00, 610}
], $.Layouts.Cliente);
