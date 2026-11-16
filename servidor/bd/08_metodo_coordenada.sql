-- Cómo se obtuvo la coordenada de cada pozo (recomendación del asesor de programación).
-- Permite distinguir la precisión: celular (metros), GPS de mano, GPS diferencial/RTK (centímetros)
-- o la coordenada oficial publicada por el REPDA.
ALTER TABLE pozo
  ADD COLUMN IF NOT EXISTS metodo_coordenada TEXT
  CHECK (metodo_coordenada IN ('celular', 'gps_mano', 'gps_diferencial', 'repda'));

-- Los pozos que vienen del REPDA usan la coordenada publicada por CONAGUA
UPDATE pozo p SET metodo_coordenada = 'repda'
FROM fuente f
WHERE f.id_fuente = p.id_fuente AND f.tipo <> 'campo' AND p.metodo_coordenada IS NULL;

-- Los pozos de la campaña piloto se ubicaron con el celular
UPDATE pozo p SET metodo_coordenada = 'celular'
FROM fuente f
WHERE f.id_fuente = p.id_fuente AND f.tipo = 'campo' AND p.metodo_coordenada IS NULL;

-- Revisar
SELECT metodo_coordenada, COUNT(*) FROM pozo GROUP BY 1;
