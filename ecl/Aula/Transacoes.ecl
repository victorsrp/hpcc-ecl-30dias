IMPORT $;

// 20 transacoes de cartao.
EXPORT Transacoes := DATASET([
  {1001,  1, 20260105,   54.90, 'Publix',         'GROCERY',     'FL'},
  {1002,  1, 20260105, 1299.00, 'Best Buy',       'ELECTRONICS', 'FL'},
  {1003,  3, 20260106,   87.20, 'Shell',          'FUEL',        'FL'},
  {1004,  4, 20260107,   23.50, 'Chipotle',       'RESTAURANT',  'TX'},
  {1005,  6, 20260107, 2450.00, 'Delta',          'TRAVEL',      'TX'},
  {1006,  6, 20260108,  310.00, 'Marriott',       'TRAVEL',      'NY'},
  {1007,  7, 20260109,   15.75, 'CVS',            'PHARMACY',    'NY'},
  {1008,  8, 20260110,  142.30, 'Kroger',         'GROCERY',     'FL'},
  {1009,  9, 20260111,  899.99, 'Apple Store',    'ELECTRONICS', 'CA'},
  {1010,  9, 20260111,   64.00, 'Chevron',        'FUEL',        'CA'},
  {1011,  1, 20260112,   38.40, 'Waffle House',   'RESTAURANT',  'GA'},
  {1012, 10, 20260113,  500.00, 'ATM Withdrawal', 'ATM',         'GA'},
  {1013, 10, 20260113,  500.00, 'ATM Withdrawal', 'ATM',         'FL'},
  {1014, 11, 20260114, 3200.00, 'Delta',          'TRAVEL',      'NY'},
  {1015, 11, 20260115,  210.45, 'Whole Foods',    'GROCERY',     'NY'},
  {1016, 12, 20260116,   19.99, 'Amazon',         'ONLINE',      'FL'},
  {1017,  3, 20260117,  420.00, 'Amazon',         'ONLINE',      'FL'},
  {1018,  4, 20260118,   61.10, 'Shell',          'FUEL',        'TX'},
  {1019,  5, 20260119,   33.25, 'Walgreens',      'PHARMACY',    'GA'},
  {1020,  8, 20260120,   75.00, 'Olive Garden',   'RESTAURANT',  'FL'}
], $.Layouts.Transacao);
