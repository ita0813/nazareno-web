-- Archivo 07: nivel estático en msnm (carga hidráulica)
-- h = elevación del terreno + altura del brocal - profundidad medida desde el brocal
-- Solo mediciones sin bombeo y de pozos con elevación conocida.

DROP VIEW IF EXISTS v_carga_hidraulica;

CREATE VIEW v_carga_hidraulica AS
SELECT m.id_medicion,
       m.id_pozo,
       m.fecha_hora,
       m.profundidad_nivel_m,
       p.elevacion_terreno_m,
       COALESCE(p.altura_brocal_m, 0) AS altura_brocal_m,
       ROUND(p.elevacion_terreno_m + COALESCE(p.altura_brocal_m, 0) - m.profundidad_nivel_m, 2)
         AS nivel_estatico_msnm
FROM medicion m
JOIN pozo p ON p.id_pozo = m.id_pozo
WHERE m.condicion = 'estatico'
  AND m.profundidad_nivel_m IS NOT NULL
  AND p.elevacion_terreno_m IS NOT NULL;