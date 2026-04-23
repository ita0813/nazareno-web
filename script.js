// Este evento asegura que el HTML cargue PRIMERO antes de buscar el ID "map"
document.addEventListener('DOMContentLoaded', function () {


    var map = L.map('map').setView([17.025, -96.733], 13);

    //mapa:
    var satelite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        attribution: 'Google Maps'
    }).addTo(map);

    //funciones colores
    function colorGeo(t) { return t == 'Gneis' ? '#fdbf6f' : t == 'Aluvial' ? '#a6cee3' : t == 'Lutita-Arenisca' ? '#fb9a99' : '#fff'; }

    function colorUso(t) {
        var c = {
            'riego': '#3b82f6',
            'temporal': '#dfc27d',
            'Pastizal inducido': '#9a5d20af',
            'Selva baja caducif': '#238b45',
            'urbano': '#e31a1c',
            'suelo desnudo': '#969696'
        };
        return c[t] || '#ccc';
    }

    function colorEdafo(g) {
        var c = { 'RG': '#ffff00', 'VR': '#800080', 'FL': '#ffcc00', 'LP': '#a6a6a6', 'NA': '#0000ff' };
        return c[g] || '#eee';
    }

    //capas
    var cuencaP = L.geoJSON(capa_cuenca2, {
        style: { color: '#0e4355', weight: 4, fillOpacity: 0.1 }
    }).addTo(map);

    var riosP = L.geoJSON(capa_reddrenaje, {
        style: { color: '#3869cb', weight: 1.8 }
    }).addTo(map);

    var cauceP = L.geoJSON(capa_cauce, {
        style: { color: '#00008B', weight: 4 }
    }).addTo(map);

    var geoP = L.geoJSON(capa_geologiaf, {
        style: function (f) { return { fillColor: colorGeo(f.properties.TIPO), color: '#333', weight: 1, fillOpacity: 0.6 }; }
    });

    var usoSueloP = L.geoJSON(capa_suelof, {
        style: function (f) { return { fillColor: colorUso(f.properties.TIPO), color: '#225e32', weight: 1, fillOpacity: 0.6 }; }
    });

    var edafoP = L.geoJSON(capa_edafologiaf, {
        style: function (f) { return { fillColor: colorEdafo(f.properties.GRUPO1), color: '#4d3319', weight: 1, fillOpacity: 0.6 }; }
    });

    var legend = L.control({ position: 'bottomright' });

    legend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info legend'),
            labels = ['<strong class="text-xs uppercase tracking-widest">Simbología</strong>'],
            cats, colFunc;

        //Detectar qué capa está activa
        if (map.hasLayer(geoP)) {
            cats = ['Gneis', 'Aluvial', 'Lutita-Arenisca'];
            colFunc = colorGeo;
        }
        else if (map.hasLayer(usoSueloP)) {
            cats = ['riego', 'temporal', 'Pastizal inducido', 'Selva baja cadu...', 'urbano'];
            colFunc = colorUso;
        }

        else if (map.hasLayer(edafoP)) {
            cats = ['RG', 'VR', 'FL', 'LP', 'NA'];
            colFunc = colorEdafo;
        }
        else {
            return L.DomUtil.create('div');
        }

        //tabla
        for (var i = 0; i < cats.length; i++) {
            div.innerHTML += labels.push('<i style="background:' + colFunc(cats[i]) + '"></i> ' + cats[i]);
        }
        div.innerHTML = labels.join('<br>');
        return div;
    };

    map.on('overlayadd overlayremove', function () {
        legend.remove();
        legend.addTo(map);
    });

    legend.addTo(map);
    L.control.layers(null, {
        "Límite Cuenca": cuencaP,
        "Cauce Principal": cauceP,
        "Red de Ríos": riosP,
        "Geología": geoP,
        "Uso de Suelo": usoSueloP,
        "Edafología": edafoP,
    }, { collapsed: false }).addTo(map);

    var limitesPendientes = [
        [16.997716, -96.815714],
        [17.063546, -96.723985]
    ];

    var capaPendientes = L.imageOverlay('pendientes.png', limitesPendientes, {
        opacity: 0.7, 
        interactive: true
    });

     overlayMaps["Pendientes (Ráster)"] = capaPendientes;

});