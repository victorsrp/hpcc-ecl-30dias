IMPORT $;

// 16 sinistros de seguro. O 116 aponta para um cliente que nao existe (de proposito).
EXPORT Sinistros := DATASET([
  {101,  1, 'COLLISION',  8400, 20250310, 'QuickFix Auto',         'PAID'},
  {102,  4, 'INJURY',    45000, 20250402, 'Crash Kings Auto',      'PAID'},
  {103,  3, 'GLASS',       350, 20250415, 'Sunshine Body Shop',    'PAID'},
  {104,  4, 'INJURY',    38000, 20250620, 'Crash Kings Auto',      'PAID'},
  {105,  6, 'THEFT',     27000, 20250701, '',                      'OPEN'},
  {106,  8, 'GLASS',      1200, 20250712, 'Sunshine Body Shop',    'DENIED'},
  {107, 10, 'INJURY',    49900, 20250803, 'Crash Kings Auto',      'PAID'},
  {108,  1, 'COLLISION',  1500, 20250911, 'QuickFix Auto',         'PAID'},
  {109,  9, 'COLLISION', 13200, 20251005, 'Golden Gate Garage',    'OPEN'},
  {110, 10, 'INJURY',    41000, 20251120, 'Crash Kings Auto',      'PAID'},
  {111,  5, 'FIRE',      22000, 20251201, 'Peach State Collision', 'PAID'},
  {112,  4, 'COLLISION',  9700, 20260115, 'Crash Kings Auto',      'OPEN'},
  {113, 12, 'GLASS',       600, 20260203, 'Sunshine Body Shop',    'PAID'},
  {114,  7, 'THEFT',     18500, 20260220, '',                      'DENIED'},
  {115,  3, 'COLLISION',  4300, 20260301, 'Sunshine Body Shop',    'PAID'},
  {116, 99, 'COLLISION',  2500, 20260310, 'QuickFix Auto',         'OPEN'}
], $.Layouts.Sinistro);
