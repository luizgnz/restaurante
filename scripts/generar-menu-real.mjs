import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "src/db/migrations/026_menu_real_restaurante.sql");

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const slug = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ingredients = {
  "Arroz g": 30000, "Papa g": 35000, "Frijol g": 12000, "Lenteja g": 8000,
  "Garbanzo g": 8000, "Arveja g": 8000, "Plátano maduro unid": 100,
  "Plátano verde unid": 100, "Carne de vacuno g": 24000, "Carne molida g": 10000,
  "Pollo g": 28000, "Pechuga de pollo g": 18000, "Hígado de vacuno g": 7000,
  "Pescado blanco g": 12000, "Tilapia g": 8000, "Reineta g": 10000,
  "Salmón g": 8000, "Cerdo g": 16000, "Chuleta de cerdo g": 10000,
  "Costillar de cerdo g": 12000, "Chicharrón g": 8000, "Chunchules g": 5000,
  "Prieta unid": 60, "Chorizo unid": 80, "Huevo unid": 240, "Cebolla g": 16000,
  "Tomate g": 12000, "Zanahoria g": 8000, "Pimentón g": 5000, "Zapallo g": 10000,
  "Choclo g": 7000, "Palta g": 6000, "Champiñón g": 5000, "Queso g": 8000,
  "Jamón g": 5000, "Harina g": 10000, "Pan rallado g": 5000, "Aceite ml": 22000,
  "Caldo ml": 30000, "Leche ml": 12000, "Crema ml": 8000,
  "Salsa de tomate ml": 10000, "Salsa de soya ml": 5000, "Ajo g": 1500,
  "Cilantro g": 1000, "Sal g": 3000, "Condimento g": 2500, "Fideos g": 10000,
  "Arepa unid": 100, "Yuca g": 8000, "Repollo g": 6000, "Limón unid": 160,
  "Azúcar g": 8000, "Café g": 3000, "Té bolsa unid": 200, "Vino ml": 12000,
  "Agua filtrada ml": 50000, "Empaque unid": 150,
};

const photo = {
  fries: "papas-fritas.jpg", coffee: "cafe.jpg", water: "agua-con-gas.jpg",
  soda: "gaseosa.jpg", juice: "jugo.jpg", lemonade: "limonada.jpg", tea: "te.jpg",
  wine: "vino-tinto.jpg", soup: "sopa-del-dia.jpg", chicken: "pollo-asado.jpg",
  beef: "lomo-a-lo-pobre.jpg", salmon: "salmon.jpg", stew: "cazuela.jpg",
  ribs: "asado-de-tira.jpg", bandeja: "bandeja-paisa.jpg", riceChicken: "arroz-con-pollo.jpg",
  beans: "frijolada.jpg", chaufa: "arroz-chaufan.jpg", tilapia: "tilapia-frita.jpg",
  porotos: "porotos-con-riendas.jpg",
  pepsi: "pepsi.jpg", bilz: "bilz.jpg", kem: "kem.jpg",
  postobon: "postobon.jpg", ponyMalta: "pony-malta.jpg",
  cocaSpriteFanta: "coca-sprite-fanta.jpg",
};

const products = [];
const add = (category, name, price, recipe, image, options = {}) => products.push({
  category, name, price, recipe, image, stock: options.stock, kind: options.kind,
  station: options.station ?? (category === "Bebidas" || category === "Extras" ? "directo" : "cocina"),
});

const unitDrink = (name, price, image = photo.soda, stock = 24) => add("Bebidas", name, price, null, image, { kind: "almacenable_unitario", stock });
[
  ["Pepsi 350 ml",1500,photo.pepsi],["PAP 350 ml",1500],["Bilz 350 ml",1500,photo.bilz],["Limón Soda 350 ml",1500],
  ["Kem 350 ml",1500,photo.kem],["Néctar Watts 350 ml",1500],["Coca-Cola 350 ml",1500,photo.cocaSpriteFanta],["Sprite 350 ml",1500,photo.cocaSpriteFanta],
  ["Fanta 350 ml",1500,photo.cocaSpriteFanta],["Pepsi 2 L",3000,photo.pepsi],["PAP 2 L",3000],["Bilz 2 L",3000,photo.bilz],
  ["Limón Soda 2 L",3000],["Kem 2 L",3000,photo.kem],["Néctar Watts 1.5 L",3000],["Coca-Cola 1.25 L",2500],
  ["Sprite 1.25 L",2500,photo.cocaSpriteFanta],["Fanta 1.25 L",2500,photo.cocaSpriteFanta],["Coca-Cola 1 L",2000,photo.cocaSpriteFanta],
].forEach(([name, price, image]) => unitDrink(name, price, image));
unitDrink("Agua con gas", 1000, photo.water, 36);
unitDrink("Agua sin gas", 1000, photo.water, 36);
unitDrink("Postobón Uva", 3000, photo.postobon, 24);
unitDrink("Postobón Manzana", 3000, photo.postobon, 24);
unitDrink("Pony Malta", 2000, photo.ponyMalta, 24);
add("Bebidas", "Vaso de limonada", 500, {"Limón unid":0.5,"Azúcar g":18,"Agua filtrada ml":300}, photo.lemonade);
add("Bebidas", "Café", 1000, {"Café g":10,"Agua filtrada ml":180}, photo.coffee);
add("Bebidas", "Té", 1000, {"Té bolsa unid":1,"Agua filtrada ml":250}, photo.tea);
add("Bebidas", "Vino", 2000, {"Vino ml":150}, photo.wine);

add("Extras", "Empaque", 500, {"Empaque unid":1}, photo.bandeja);

add("Porciones", "Papas fritas pequeña", 2000, {"Papa g":220,"Aceite ml":25,"Sal g":2}, photo.fries);
add("Porciones", "Papas fritas mediana", 3000, {"Papa g":350,"Aceite ml":38,"Sal g":3}, photo.fries);
add("Porciones", "Papas fritas grande", 4000, {"Papa g":520,"Aceite ml":55,"Sal g":4}, photo.fries);
add("Porciones", "Porción de arroz", 1500, {"Arroz g":100,"Aceite ml":5,"Sal g":1}, photo.riceChicken);
add("Porciones", "Porción de frijoles", 3500, {"Frijol g":140,"Cebolla g":25,"Tomate g":25,"Aceite ml":8,"Condimento g":2}, photo.beans);
add("Porciones", "Porción de lentejas", 3500, {"Lenteja g":140,"Cebolla g":25,"Tomate g":20,"Zanahoria g":20,"Aceite ml":8}, photo.beans);
add("Porciones", "Porción de garbanzos", 3500, {"Garbanzo g":140,"Cebolla g":25,"Tomate g":20,"Aceite ml":8}, photo.beans);
add("Porciones", "Porción de arvejas", 3500, {"Arveja g":140,"Cebolla g":20,"Zanahoria g":20,"Aceite ml":8}, photo.beans);
add("Porciones", "Porción de tajadas", 1500, {"Plátano maduro unid":1,"Aceite ml":25}, photo.bandeja);
add("Porciones", "Porción de chicharrón", 3500, {"Chicharrón g":180,"Sal g":2}, photo.ribs);
add("Porciones", "Porción de patacones", 2000, {"Plátano verde unid":1,"Aceite ml":30,"Sal g":2}, photo.fries);
add("Porciones", "Porción de sopa", 3000, {"Caldo ml":350,"Papa g":100,"Zanahoria g":35,"Cebolla g":20,"Cilantro g":3}, photo.soup);

const basePlate = {"Arroz g":100,"Papa g":150,"Cebolla g":25,"Tomate g":30,"Aceite ml":12,"Sal g":2,"Condimento g":2};
const r = (extra) => ({...basePlate, ...extra});
add("Platos colombianos","Res sudada colombiana",7500,r({"Carne de vacuno g":220,"Caldo ml":120,"Papa g":220}),photo.stew);
add("Platos colombianos","Res a la plancha colombiana",7500,r({"Carne de vacuno g":230}),photo.beef);
add("Platos colombianos","Res encebollada colombiana",7500,r({"Carne de vacuno g":220,"Cebolla g":100}),photo.beef);
add("Platos colombianos","Pollo a la plancha colombiano",7000,r({"Pechuga de pollo g":220}),photo.chicken);
add("Platos colombianos","Pollo apanado colombiano",7000,r({"Pechuga de pollo g":220,"Pan rallado g":35,"Harina g":20,"Huevo unid":0.5}),photo.chicken);
add("Platos colombianos","Pollo al horno colombiano",7500,r({"Pollo g":280}),photo.chicken);
add("Platos colombianos","Pollo al jugo colombiano",7500,r({"Pollo g":280,"Caldo ml":120}),photo.chicken);
add("Platos colombianos","Pechuga en salsa de champiñones",7500,r({"Pechuga de pollo g":220,"Champiñón g":80,"Crema ml":70}),photo.chicken);
add("Platos colombianos","Pechuga rellena",7500,r({"Pechuga de pollo g":230,"Queso g":45,"Jamón g":45}),photo.chicken);
add("Platos colombianos","Hígado encebollado",7500,r({"Hígado de vacuno g":220,"Cebolla g":110}),photo.beef);
add("Platos colombianos","Pescado colombiano",8000,r({"Pescado blanco g":240,"Harina g":25,"Limón unid":0.5}),photo.tilapia);
add("Platos colombianos","Reineta colombiana",9000,r({"Reineta g":240,"Limón unid":0.5}),photo.tilapia);
add("Platos colombianos","Salmón colombiano",10000,r({"Salmón g":230,"Limón unid":0.5}),photo.salmon);
add("Platos colombianos","Cerdo a la plancha colombiano",7000,r({"Cerdo g":230}),photo.ribs);
add("Platos colombianos","Cerdo apanado colombiano",7000,r({"Cerdo g":230,"Pan rallado g":35,"Harina g":20,"Huevo unid":0.5}),photo.ribs);
add("Platos colombianos","Chuleta vetada colombiana",9500,r({"Chuleta de cerdo g":320}),photo.ribs);

add("Platos completos","Bandeja paisa",12000,{"Arroz g":100,"Frijol g":130,"Carne molida g":100,"Chicharrón g":100,"Chorizo unid":1,"Huevo unid":1,"Plátano maduro unid":0.5,"Arepa unid":1,"Palta g":60,"Aceite ml":20},photo.bandeja);
add("Platos completos","Bistec a lo pobre",10000,{"Carne de vacuno g":250,"Papa g":280,"Cebolla g":100,"Huevo unid":2,"Aceite ml":35,"Sal g":3},photo.beef);
add("Platos completos","Arroz con pollo",8500,{"Arroz g":150,"Pollo g":220,"Arveja g":35,"Zanahoria g":40,"Pimentón g":25,"Cebolla g":30,"Caldo ml":180,"Aceite ml":12},photo.riceChicken);
add("Platos completos","Arroz chaufán",7500,{"Arroz g":160,"Pollo g":80,"Cerdo g":70,"Huevo unid":1,"Cebolla g":30,"Pimentón g":25,"Salsa de soya ml":25,"Aceite ml":15},photo.chaufa);
add("Platos completos","Frijolada",9000,{"Frijol g":180,"Carne de vacuno g":100,"Chicharrón g":80,"Chorizo unid":1,"Plátano maduro unid":0.5,"Arroz g":90,"Cebolla g":30,"Tomate g":30},photo.beans);
add("Platos completos","Tilapia frita",9500,{"Tilapia g":320,"Harina g":35,"Aceite ml":55,"Arroz g":100,"Plátano verde unid":1,"Repollo g":60,"Limón unid":0.5},photo.tilapia);
add("Platos completos","Sopa especial",8500,{"Caldo ml":500,"Carne de vacuno g":120,"Pollo g":100,"Papa g":150,"Yuca g":100,"Choclo g":70,"Plátano verde unid":0.5,"Cilantro g":4},photo.soup);
add("Platos completos","Arroz mixto",10500,{"Arroz g":170,"Pollo g":100,"Carne de vacuno g":100,"Cerdo g":80,"Arveja g":30,"Pimentón g":25,"Salsa de soya ml":20,"Aceite ml":15},photo.chaufa);
add("Platos completos","Sudado de pollo",9000,{"Pollo g":300,"Papa g":220,"Yuca g":100,"Tomate g":60,"Cebolla g":60,"Caldo ml":180,"Arroz g":100},photo.stew);
add("Platos completos","Cazuela de vacuno",9500,{"Carne de vacuno g":250,"Papa g":180,"Zapallo g":120,"Choclo g":100,"Arroz g":50,"Zanahoria g":50,"Caldo ml":450,"Cilantro g":4},photo.stew);
add("Platos completos","Porotos con riendas",7500,{"Frijol g":170,"Fideos g":80,"Zapallo g":100,"Cebolla g":40,"Ajo g":5,"Aceite ml":10,"Condimento g":2},photo.porotos);
add("Platos completos","Cocimiento",9000,{"Carne de vacuno g":120,"Cerdo g":100,"Pollo g":100,"Chorizo unid":1,"Papa g":160,"Choclo g":90,"Zapallo g":100,"Caldo ml":450},photo.stew);

add("Platos chilenos","Carne a la cacerola",9500,r({"Carne de vacuno g":250,"Caldo ml":160,"Papa g":220}),photo.stew);
add("Platos chilenos","Pollo al horno chileno",9500,r({"Pollo g":320}),photo.chicken);
add("Platos chilenos","Carne mongoliana",8500,{"Carne de vacuno g":220,"Arroz g":120,"Cebolla g":80,"Salsa de soya ml":30,"Ajo g":5,"Aceite ml":12},photo.beef);
add("Platos chilenos","Pescado chileno",9000,r({"Pescado blanco g":250,"Harina g":25,"Limón unid":0.5}),photo.tilapia);
add("Platos chilenos","Reineta chilena",11000,r({"Reineta g":260,"Limón unid":0.5}),photo.tilapia);
add("Platos chilenos","Chuletón chileno",10500,r({"Chuleta de cerdo g":350}),photo.ribs);
add("Platos chilenos","Salmón al ajillo",13000,r({"Salmón g":260,"Ajo g":10,"Limón unid":0.5}),photo.salmon);
add("Platos chilenos","Pollo al jugo chileno",7500,r({"Pollo g":300,"Caldo ml":140}),photo.chicken);
add("Platos chilenos","Bistec de panita",8000,r({"Hígado de vacuno g":230,"Cebolla g":60}),photo.beef);
add("Platos chilenos","Prietas",8000,r({"Prieta unid":2}),photo.ribs);
add("Platos chilenos","Chunchules",9000,r({"Chunchules g":260,"Limón unid":0.5}),photo.ribs);
add("Platos chilenos","Costillar al horno",11500,r({"Costillar de cerdo g":350}),photo.ribs);

const categories = [...new Map(products.map(p => [p.category, p.station])).entries()];
const lines = [
  "-- Catálogo real normalizado desde Menu.xlsx (Hoja1, A1:S32).",
  "-- La migración conserva la historia: desactiva el POS anterior, nunca borra productos usados.",
  "CREATE TABLE IF NOT EXISTS demo_stock_base (producto_id INTEGER PRIMARY KEY REFERENCES productos(id), on_hand_real REAL NOT NULL);",
  "UPDATE productos SET activo=0, disponible_en_pos=0 WHERE disponible_en_pos=1 AND COALESCE(codigo,'') NOT LIKE 'menu-real:%';",
];
for (const [name, station] of categories) {
  lines.push(`INSERT INTO categorias_pos (nombre, estacion) SELECT ${q(name)}, ${q(station)} WHERE NOT EXISTS (SELECT 1 FROM categorias_pos WHERE lower(nombre)=lower(${q(name)}));`);
  lines.push(`UPDATE categorias_pos SET estacion=${q(station)} WHERE lower(nombre)=lower(${q(name)});`);
}
for (const [name, stock] of Object.entries(ingredients)) {
  const code = `insumo:${slug(name)}`;
  lines.push(`INSERT INTO productos (nombre,precio_centavos,categoria_id,tipo_consumo,disponible_en_pos,activo,codigo,color,foto_data,rastrear_inventario) VALUES (${q(name)},0,NULL,'almacenable_unitario',0,1,${q(code)},'#8b7d6b',NULL,1) ON CONFLICT(codigo) WHERE codigo IS NOT NULL AND trim(codigo) != '' DO UPDATE SET nombre=excluded.nombre,activo=1,rastrear_inventario=1;`);
  lines.push(`INSERT INTO stock (producto_id,on_hand_real,reserved_real) VALUES ((SELECT id FROM productos WHERE codigo=${q(code)}),${stock},0) ON CONFLICT(producto_id) DO UPDATE SET on_hand_real=excluded.on_hand_real,reserved_real=0;`);
  lines.push(`INSERT INTO demo_stock_base (producto_id,on_hand_real) VALUES ((SELECT id FROM productos WHERE codigo=${q(code)}),${stock}) ON CONFLICT(producto_id) DO UPDATE SET on_hand_real=excluded.on_hand_real;`);
}
for (const product of products) {
  const code = `menu-real:${slug(product.category)}:${slug(product.name)}`;
  const kind = product.kind ?? "receta_kit";
  const track = kind !== "no_almacenable" ? 1 : 0;
  const image = `/productos/menu-real/${product.image}`;
  lines.push(`INSERT INTO productos (nombre,precio_centavos,categoria_id,tipo_consumo,disponible_en_pos,activo,codigo,color,foto_data,rastrear_inventario) VALUES (${q(product.name)},${product.price},(SELECT id FROM categorias_pos WHERE lower(nombre)=lower(${q(product.category)}) LIMIT 1),${q(kind)},1,1,${q(code)},'#9c4f2f',${q(image)},${track}) ON CONFLICT(codigo) WHERE codigo IS NOT NULL AND trim(codigo) != '' DO UPDATE SET nombre=excluded.nombre,precio_centavos=excluded.precio_centavos,categoria_id=excluded.categoria_id,tipo_consumo=excluded.tipo_consumo,disponible_en_pos=1,activo=1,foto_data=excluded.foto_data,rastrear_inventario=excluded.rastrear_inventario;`);
  lines.push(`DELETE FROM receta_lineas WHERE producto_id=(SELECT id FROM productos WHERE codigo=${q(code)});`);
  if (product.recipe) for (const [ingredient, amount] of Object.entries(product.recipe)) {
    lines.push(`INSERT INTO receta_lineas (producto_id,ingrediente_id,cantidad_real) VALUES ((SELECT id FROM productos WHERE codigo=${q(code)}),(SELECT id FROM productos WHERE codigo=${q(`insumo:${slug(ingredient)}`)}),${amount});`);
  }
  if (product.stock != null) {
    lines.push(`INSERT INTO stock (producto_id,on_hand_real,reserved_real) VALUES ((SELECT id FROM productos WHERE codigo=${q(code)}),${product.stock},0) ON CONFLICT(producto_id) DO UPDATE SET on_hand_real=excluded.on_hand_real,reserved_real=0;`);
    lines.push(`INSERT INTO demo_stock_base (producto_id,on_hand_real) VALUES ((SELECT id FROM productos WHERE codigo=${q(code)}),${product.stock}) ON CONFLICT(producto_id) DO UPDATE SET on_hand_real=excluded.on_hand_real;`);
  }
}
lines.push("INSERT INTO contorno_grupos (nombre) VALUES ('Cambio de acompañamiento') ON CONFLICT(nombre) DO NOTHING;");
lines.push("INSERT INTO contorno_variantes (grupo_id,nombre,suplemento_centavos,extra_centavos,activo) SELECT id,'Mantener acompañamiento',0,0,1 FROM contorno_grupos WHERE nombre='Cambio de acompañamiento' ON CONFLICT(grupo_id,nombre) DO UPDATE SET suplemento_centavos=0,activo=1;");
lines.push("INSERT INTO contorno_variantes (grupo_id,nombre,suplemento_centavos,extra_centavos,activo) SELECT id,'Cambiar por papas fritas',1000,0,1 FROM contorno_grupos WHERE nombre='Cambio de acompañamiento' ON CONFLICT(grupo_id,nombre) DO UPDATE SET suplemento_centavos=1000,activo=1;");
for (const product of products.filter(p => p.category === "Platos completos")) {
  const code = `menu-real:${slug(product.category)}:${slug(product.name)}`;
  lines.push(`INSERT INTO plato_slots (producto_id,posicion,nombre,permite_extra) SELECT id,1,'Acompañamiento',0 FROM productos WHERE codigo=${q(code)} ON CONFLICT(producto_id,posicion) DO UPDATE SET nombre='Acompañamiento',permite_extra=0;`);
  lines.push(`INSERT INTO plato_slot_grupos (slot_id,grupo_id) SELECT ps.id,cg.id FROM plato_slots ps JOIN productos p ON p.id=ps.producto_id CROSS JOIN contorno_grupos cg WHERE p.codigo=${q(code)} AND ps.posicion=1 AND cg.nombre='Cambio de acompañamiento' ON CONFLICT(slot_id,grupo_id) DO NOTHING;`);
}
lines.push("DELETE FROM demo_stock_base WHERE producto_id NOT IN (SELECT id FROM productos WHERE activo=1 AND rastrear_inventario=1);");

await mkdir(dirname(output), { recursive: true });
await writeFile(output, lines.join("\n") + "\n");
console.log(`generada ${output} (${products.length} productos, ${Object.keys(ingredients).length} insumos)`);
