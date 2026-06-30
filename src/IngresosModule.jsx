import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

export default function IngresosModule() {
  const [ingresos, setIngresos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);

  const [form, setForm] = useState({
    descripcion: "",
    categoria_id: "",
    categoria_nueva: "",
    miembro_familia_id: "",
    miembro_nuevo: "",
    monto: "",
    fecha: "",
  });

  useEffect(() => {
    cargarCategorias();
    cargarMiembros();
    cargarIngresos();
  }, []);

  useEffect(() => {
    const canal = supabase
      .channel("ingresos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ingresos" },
        () => {
          cargarIngresos();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function cargarCategorias() {
    const { data, error } = await supabase
      .from("categorias")
      .select("*")
      .eq("tipo", "ingreso")
      .order("nombre", { ascending: true });
    if (error) {
      console.error("Error:", error);
      return;
    }
    setCategorias(data);
  }

  async function cargarMiembros() {
    const { data, error } = await supabase
      .from("categorias")
      .select("*")
      .eq("tipo", "miembro_familia")
      .order("nombre", { ascending: true });
    if (error) {
      console.error("Error:", error);
      return;
    }
    setMiembros(data);
  }

  async function cargarIngresos() {
    setCargando(true);
    const { data, error } = await supabase
      .from("ingresos")
      .select(
        "*, categoria:categoria_id(nombre), miembro:miembro_familia_id(nombre)"
      )
      .order("fecha", { ascending: false });
    if (error) {
      console.error("Error:", error);
      setCargando(false);
      return;
    }
    setIngresos(data);
    setCargando(false);
  }

  function manejarCambio(e) {
    const { name, value } = e.target;
    setForm((ant) => ({ ...ant, [name]: value }));
  }

  async function manejarEnvio(e) {
    e.preventDefault();

    let categoriaIdFinal = form.categoria_id;
    if (form.categoria_id === "nueva" && form.categoria_nueva.trim() !== "") {
      const { data, error } = await supabase
        .from("categorias")
        .insert({ nombre: form.categoria_nueva.trim(), tipo: "ingreso" })
        .select()
        .single();
      if (error) {
        alert("No se pudo crear la categoría.");
        return;
      }
      categoriaIdFinal = data.id;
      cargarCategorias();
    }

    let miembroIdFinal = form.miembro_familia_id || null;
    if (
      form.miembro_familia_id === "nuevo" &&
      form.miembro_nuevo.trim() !== ""
    ) {
      const { data, error } = await supabase
        .from("categorias")
        .insert({ nombre: form.miembro_nuevo.trim(), tipo: "miembro_familia" })
        .select()
        .single();
      if (error) {
        alert("No se pudo crear el miembro.");
        return;
      }
      miembroIdFinal = data.id;
      cargarMiembros();
    }

    const datosIngreso = {
      descripcion: form.descripcion,
      categoria_id: categoriaIdFinal,
      miembro_familia_id: miembroIdFinal,
      monto: parseFloat(form.monto),
      fecha: form.fecha,
    };

    let error;
    if (editandoId) {
      const res = await supabase
        .from("ingresos")
        .update(datosIngreso)
        .eq("id", editandoId);
      error = res.error;
    } else {
      const res = await supabase.from("ingresos").insert(datosIngreso);
      error = res.error;
    }
    if (error) {
      alert("No se pudo guardar el ingreso.");
      return;
    }

    limpiarFormulario();
    cargarIngresos();
  }

  function limpiarFormulario() {
    setForm({
      descripcion: "",
      categoria_id: "",
      categoria_nueva: "",
      miembro_familia_id: "",
      miembro_nuevo: "",
      monto: "",
      fecha: "",
    });
    setEditandoId(null);
  }

  function editarIngreso(ingreso) {
    setForm({
      descripcion: ingreso.descripcion || "",
      categoria_id: ingreso.categoria_id || "",
      categoria_nueva: "",
      miembro_familia_id: ingreso.miembro_familia_id || "",
      miembro_nuevo: "",
      monto: ingreso.monto?.toString() || "",
      fecha: ingreso.fecha || "",
    });
    setEditandoId(ingreso.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function eliminarIngreso(id) {
    if (!window.confirm("¿Seguro que querés eliminar este ingreso?")) return;
    const { error } = await supabase.from("ingresos").delete().eq("id", id);
    if (error) {
      alert("No se pudo eliminar.");
      return;
    }
    cargarIngresos();
  }

  function formatearMonto(valor) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(valor);
  }

  const totalIngresos = ingresos.reduce(
    (acc, i) => acc + parseFloat(i.monto || 0),
    0
  );

  return (
    <div className="container">
      <h1>Ingresos</h1>
      <p className="subtitulo">Registrá los ingresos de la familia.</p>

      <div className="formulario">
        <h2>{editandoId ? "Editar ingreso" : "Nuevo ingreso"}</h2>
        <form onSubmit={manejarEnvio}>
          <div className="grid-2">
            <div className="campo col-span-2">
              <label>Descripción</label>
              <input
                type="text"
                name="descripcion"
                value={form.descripcion}
                onChange={manejarCambio}
                placeholder="Ej: Sueldo de marzo, Pago proyecto X"
                required
              />
            </div>

            <div className="campo">
              <label>Categoría</label>
              <select
                name="categoria_id"
                value={form.categoria_id}
                onChange={manejarCambio}
                required
              >
                <option value="">Seleccionar categoría</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
                <option value="nueva">+ Nueva categoría</option>
              </select>
            </div>
            {form.categoria_id === "nueva" && (
              <div className="campo">
                <label>Nombre de la nueva categoría</label>
                <input
                  type="text"
                  name="categoria_nueva"
                  value={form.categoria_nueva}
                  onChange={manejarCambio}
                  placeholder="Ej: Sueldo, Emprendimiento"
                  required
                />
              </div>
            )}

            <div className="campo">
              <label>¿Quién lo recibió? (opcional)</label>
              <select
                name="miembro_familia_id"
                value={form.miembro_familia_id}
                onChange={manejarCambio}
              >
                <option value="">Sin especificar</option>
                {miembros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
                <option value="nuevo">+ Agregar miembro</option>
              </select>
            </div>
            {form.miembro_familia_id === "nuevo" && (
              <div className="campo">
                <label>Nombre del miembro</label>
                <input
                  type="text"
                  name="miembro_nuevo"
                  value={form.miembro_nuevo}
                  onChange={manejarCambio}
                  placeholder="Ej: María, Juan"
                  required
                />
              </div>
            )}

            <div className="campo">
              <label>Monto</label>
              <input
                type="number"
                step="0.01"
                name="monto"
                value={form.monto}
                onChange={manejarCambio}
                placeholder="0.00"
                required
              />
            </div>

            <div className="campo">
              <label>Fecha de cobro</label>
              <input
                type="date"
                name="fecha"
                value={form.fecha}
                onChange={manejarCambio}
                required
              />
            </div>
          </div>

          <div className="botones">
            <button type="submit" className="btn-primary">
              {editandoId ? "Guardar cambios" : "Agregar ingreso"}
            </button>
            {editandoId && (
              <button
                type="button"
                onClick={limpiarFormulario}
                className="btn-secondary"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      {!cargando && ingresos.length > 0 && (
        <div className="total-card">
          <span className="total-label">Total ingresos</span>
          <span className="total-monto">{formatearMonto(totalIngresos)}</span>
        </div>
      )}

      <h2>Ingresos cargados</h2>
      {cargando && <p className="texto-cargando">Cargando ingresos...</p>}
      {!cargando && ingresos.length === 0 && (
        <p className="texto-vacio">Todavía no cargaste ningún ingreso.</p>
      )}

      <div className="lista">
        {ingresos.map((ingreso) => (
          <div key={ingreso.id} className="gasto-card">
            <div className="gasto-info">
              <div className="gasto-titulo">
                <span className="gasto-nombre">{ingreso.descripcion}</span>
                {ingreso.miembro?.nombre && (
                  <span className="badge badge-miembro">
                    {ingreso.miembro.nombre}
                  </span>
                )}
              </div>
              <span className="gasto-meta">
                {ingreso.categoria?.nombre || "Sin categoría"} ·{" "}
                {new Date(ingreso.fecha + "T00:00:00").toLocaleDateString(
                  "es-AR"
                )}
              </span>
            </div>
            <div className="gasto-acciones">
              <span className="gasto-monto ingreso-monto">
                {formatearMonto(ingreso.monto)}
              </span>
              <button
                onClick={() => editarIngreso(ingreso)}
                className="btn-editar"
              >
                Editar
              </button>
              <button
                onClick={() => eliminarIngreso(ingreso.id)}
                className="btn-eliminar"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
