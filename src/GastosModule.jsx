import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

function GrupoFecha({
  fecha,
  items,
  total,
  formatearMonto,
  renderCard,
  esPendiente,
}) {
  const [expandido, setExpandido] = useState(true);

  return (
    <div style={{ marginBottom: "8px" }}>
      <div
        className={`grupo-fecha-header ${
          esPendiente ? "grupo-fecha-pendiente" : ""
        }`}
        onClick={() => setExpandido(!expandido)}
        style={{ cursor: "pointer" }}
      >
        <span className="grupo-fecha-titulo">{fecha}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="grupo-fecha-total">{formatearMonto(total)}</span>
          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>
            {expandido ? "▲" : "▼"}
          </span>
        </div>
      </div>
      {expandido && (
        <div
          className="lista"
          style={{ marginTop: "6px", marginBottom: "8px" }}
        >
          {items.map((g) => renderCard(g))}
        </div>
      )}
    </div>
  );
}

export default function GastosModule() {
  const hoy = new Date();
  const [gastos, setGastos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [mediosPago, setMediosPago] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroMes, setFiltroMes] = useState(hoy.getMonth());
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());
  const [filtrarPorMes, setFiltrarPorMes] = useState(true);

  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [busquedaActiva, setBusquedaActiva] = useState("");
  const [resultadoActual, setResultadoActual] = useState(0);
  const resultadosRef = useRef([]);

  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const anios = [
    hoy.getFullYear() - 2,
    hoy.getFullYear() - 1,
    hoy.getFullYear(),
  ];

  const [form, setForm] = useState({
    descripcion: "",
    categoria_id: "",
    categoria_nueva: "",
    medio_pago_id: "",
    medio_pago_nuevo: "",
    miembro_familia_id: "",
    miembro_nuevo: "",
    monto: "",
    fecha_vencimiento: "",
    fecha_pago_real: "",
    estado: "pendiente",
    es_cuota: false,
    cuota_fija: true,
    total_cuotas: "",
    monto_total: "",
    monto_por_cuota: "",
    cuotas_variables: [],
    numero_cuota: null,
  });

  useEffect(() => {
    cargarCategorias();
    cargarMediosPago();
    cargarMiembros();
  }, []);

  useEffect(() => {
    cargarGastos();
  }, [filtroMes, filtroAnio, filtrarPorMes, filtroEstado]);

  useEffect(() => {
    const canal = supabase
      .channel("gastos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gastos" },
        () => cargarGastos()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  async function cargarCategorias() {
    const { data } = await supabase
      .from("categorias")
      .select("*")
      .eq("tipo", "gasto")
      .order("nombre");
    setCategorias(data || []);
  }

  async function cargarMediosPago() {
    const { data } = await supabase
      .from("categorias")
      .select("*")
      .eq("tipo", "medio_pago")
      .order("nombre");
    setMediosPago(data || []);
  }

  async function cargarMiembros() {
    const { data } = await supabase
      .from("categorias")
      .select("*")
      .eq("tipo", "miembro_familia")
      .order("nombre");
    setMiembros(data || []);
  }

  async function cargarGastos() {
    setCargando(true);
    const desde = new Date(filtroAnio, filtroMes, 1)
      .toISOString()
      .split("T")[0];
    const hasta = new Date(filtroAnio, filtroMes + 1, 0)
      .toISOString()
      .split("T")[0];

    const { data, error } = await supabase
      .from("gastos")
      .select(
        "*, categoria:categoria_id(nombre), medio_pago:medio_pago_id(nombre), miembro:miembro_familia_id(nombre)"
      )
      .order("fecha_vencimiento", { ascending: false });

    if (error) {
      console.error("Error:", error);
      setCargando(false);
      return;
    }

    let resultado = [];

    if (filtrarPorMes) {
      const gastosSimplesMes = data.filter(
        (g) =>
          !g.es_cuota &&
          g.fecha_vencimiento >= desde &&
          g.fecha_vencimiento <= hasta
      );
      const cuotasPagadasMes = data.filter(
        (g) =>
          g.es_cuota &&
          g.estado === "pagado" &&
          g.fecha_pago_real >= desde &&
          g.fecha_pago_real <= hasta
      );
      const gruposVistos = new Set();
      const cuotasPendientesMes = [];
      data
        .filter((g) => g.es_cuota && g.estado === "pendiente")
        .sort(
          (a, b) =>
            new Date(b.fecha_vencimiento) - new Date(a.fecha_vencimiento)
        )
        .forEach((g) => {
          if (!gruposVistos.has(g.grupo_cuota_id)) {
            if (g.fecha_vencimiento >= desde && g.fecha_vencimiento <= hasta) {
              gruposVistos.add(g.grupo_cuota_id);
              cuotasPendientesMes.push(g);
            }
          }
        });
      resultado = [
        ...gastosSimplesMes,
        ...cuotasPagadasMes,
        ...cuotasPendientesMes,
      ];
    } else {
      const gruposVistos = new Set();
      data.forEach((g) => {
        if (!g.es_cuota) {
          resultado.push(g);
        } else if (g.estado === "pagado") {
          resultado.push(g);
        } else if (g.es_cuota && g.estado === "pendiente") {
          if (!gruposVistos.has(g.grupo_cuota_id)) {
            gruposVistos.add(g.grupo_cuota_id);
            resultado.push(g);
          }
        }
      });
    }

    if (filtroEstado !== "todos") {
      resultado = resultado.filter((g) => g.estado === filtroEstado);
    }

    setGastos(resultado);
    setCargando(false);
  }

  function agruparGastos(lista) {
    const hoyStr = new Date().toISOString().split("T")[0];
    const hace3Dias = new Date();
    hace3Dias.setDate(hace3Dias.getDate() - 3);
    const hace3DiasStr = hace3Dias.toISOString().split("T")[0];

    const recientes = lista
      .filter(
        (g) =>
          g.estado === "pagado" &&
          g.fecha_pago_real >= hace3DiasStr &&
          g.fecha_pago_real <= hoyStr
      )
      .sort(
        (a, b) => new Date(b.fecha_pago_real) - new Date(a.fecha_pago_real)
      );

    const pagadosAntiguos = lista
      .filter((g) => g.estado === "pagado" && g.fecha_pago_real < hace3DiasStr)
      .sort(
        (a, b) => new Date(b.fecha_pago_real) - new Date(a.fecha_pago_real)
      );

    const gruposPagados = {};
    pagadosAntiguos.forEach((g) => {
      const fecha = g.fecha_pago_real || "Sin fecha";
      if (!gruposPagados[fecha]) gruposPagados[fecha] = [];
      gruposPagados[fecha].push(g);
    });

    const pendientes = lista
      .filter((g) => g.estado === "pendiente")
      .sort(
        (a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento)
      );

    const gruposPendientes = {};
    pendientes.forEach((g) => {
      const fecha = g.fecha_vencimiento || "Sin fecha";
      if (!gruposPendientes[fecha]) gruposPendientes[fecha] = [];
      gruposPendientes[fecha].push(g);
    });

    return { recientes, gruposPagados, gruposPendientes };
  }

  function buscar() {
    if (!textoBusqueda.trim()) {
      setBusquedaActiva("");
      setResultadoActual(0);
      resultadosRef.current = [];
      return;
    }
    setBusquedaActiva(textoBusqueda.trim().toLowerCase());
    setResultadoActual(0);
  }

  function limpiarBusqueda() {
    setTextoBusqueda("");
    setBusquedaActiva("");
    setResultadoActual(0);
    resultadosRef.current = [];
  }

  const gastosFiltrados = busquedaActiva
    ? gastos.filter((g) => {
        const desc =
          (g.es_cuota
            ? g.descripcion.split(" (")[0]
            : g.descripcion
          )?.toLowerCase() || "";
        const cat = g.categoria?.nombre?.toLowerCase() || "";
        return desc.includes(busquedaActiva) || cat.includes(busquedaActiva);
      })
    : gastos;

  const totalResultados = busquedaActiva ? gastosFiltrados.length : 0;

  function irAnterior() {
    if (totalResultados === 0) return;
    setResultadoActual((prev) => (prev === 0 ? totalResultados - 1 : prev - 1));
  }

  function irSiguiente() {
    if (totalResultados === 0) return;
    setResultadoActual((prev) => (prev === totalResultados - 1 ? 0 : prev + 1));
  }

  useEffect(() => {
    if (busquedaActiva && resultadosRef.current[resultadoActual]) {
      resultadosRef.current[resultadoActual].scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [resultadoActual, busquedaActiva]);

  function manejarCambio(e) {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;
    setForm((ant) => {
      const nuevo = { ...ant, [name]: val };
      if (name === "monto_total" && ant.total_cuotas && ant.cuota_fija) {
        const porCuota = parseFloat(value) / parseInt(ant.total_cuotas);
        nuevo.monto_por_cuota = isNaN(porCuota) ? "" : porCuota.toFixed(2);
      }
      if (name === "monto_por_cuota" && ant.total_cuotas && ant.cuota_fija) {
        const total = parseFloat(value) * parseInt(ant.total_cuotas);
        nuevo.monto_total = isNaN(total) ? "" : total.toFixed(2);
      }
      if (name === "total_cuotas") {
        const n = parseInt(value) || 0;
        if (ant.cuota_fija) {
          if (ant.monto_total) {
            nuevo.monto_por_cuota = (parseFloat(ant.monto_total) / n).toFixed(
              2
            );
          } else if (ant.monto_por_cuota) {
            nuevo.monto_total = (parseFloat(ant.monto_por_cuota) * n).toFixed(
              2
            );
          }
        } else {
          nuevo.cuotas_variables = Array.from(
            { length: Math.min(n, 24) },
            (_, i) => ({ numero: i + 1, monto: "" })
          );
        }
      }
      if (name === "cuota_fija") {
        nuevo.monto_total = "";
        nuevo.monto_por_cuota = "";
        nuevo.cuotas_variables =
          !checked && ant.total_cuotas
            ? Array.from(
                { length: Math.min(parseInt(ant.total_cuotas), 24) },
                (_, i) => ({ numero: i + 1, monto: "" })
              )
            : [];
      }
      return nuevo;
    });
  }

  function manejarCuotaVariable(index, valor) {
    setForm((ant) => {
      const nuevasCuotas = [...ant.cuotas_variables];
      nuevasCuotas[index] = { ...nuevasCuotas[index], monto: valor };
      return { ...ant, cuotas_variables: nuevasCuotas };
    });
  }

  function sumarMeses(fechaBase, meses) {
    const fecha = new Date(fechaBase + "T00:00:00");
    fecha.setMonth(fecha.getMonth() + meses);
    return fecha.toISOString().split("T")[0];
  }

  async function resolverNuevoItem(idActual, valorNuevo, tipo, recargar) {
    if (idActual !== "nuevo" && idActual !== "nueva") return idActual || null;
    if (!valorNuevo.trim()) return null;
    const { data, error } = await supabase
      .from("categorias")
      .insert({ nombre: valorNuevo.trim(), tipo })
      .select()
      .single();
    if (error) {
      alert(`No se pudo crear: ${tipo}`);
      return null;
    }
    recargar();
    return data.id;
  }

  async function manejarEnvio(e) {
    e.preventDefault();
    const categoriaIdFinal = await resolverNuevoItem(
      form.categoria_id,
      form.categoria_nueva,
      "gasto",
      cargarCategorias
    );
    if (!categoriaIdFinal) return;
    const medioPagoIdFinal = await resolverNuevoItem(
      form.medio_pago_id,
      form.medio_pago_nuevo,
      "medio_pago",
      cargarMediosPago
    );
    const miembroIdFinal = await resolverNuevoItem(
      form.miembro_familia_id,
      form.miembro_nuevo,
      "miembro_familia",
      cargarMiembros
    );
    const hoyStr = new Date().toISOString().split("T")[0];
    const fechaVencimientoFinal = form.fecha_vencimiento || hoyStr;

    if (form.es_cuota && !editandoId) {
      const totalCuotas = parseInt(form.total_cuotas);
      const grupoCuotaId = crypto.randomUUID();
      let cuotas;
      if (form.cuota_fija) {
        const montoPorCuota = parseFloat(form.monto_por_cuota);
        cuotas = Array.from({ length: totalCuotas }, (_, i) => ({
          descripcion: `${form.descripcion} (${i + 1}/${totalCuotas})`,
          categoria_id: categoriaIdFinal,
          medio_pago_id: medioPagoIdFinal,
          miembro_familia_id: miembroIdFinal,
          monto: montoPorCuota,
          fecha_vencimiento: sumarMeses(fechaVencimientoFinal, i),
          fecha_pago_real: null,
          estado: "pendiente",
          es_cuota: true,
          grupo_cuota_id: grupoCuotaId,
          numero_cuota: i + 1,
          total_cuotas: totalCuotas,
        }));
      } else {
        cuotas = form.cuotas_variables.map((c, i) => ({
          descripcion: `${form.descripcion} (${i + 1}/${totalCuotas})`,
          categoria_id: categoriaIdFinal,
          medio_pago_id: medioPagoIdFinal,
          miembro_familia_id: miembroIdFinal,
          monto: parseFloat(c.monto) || 0,
          fecha_vencimiento: sumarMeses(fechaVencimientoFinal, i),
          fecha_pago_real: null,
          estado: "pendiente",
          es_cuota: true,
          grupo_cuota_id: grupoCuotaId,
          numero_cuota: i + 1,
          total_cuotas: totalCuotas,
        }));
      }
      const { error } = await supabase.from("gastos").insert(cuotas);
      if (error) {
        alert("No se pudieron guardar las cuotas.");
        return;
      }
    } else {
      const fechaPagoReal =
        form.estado === "pagado"
          ? form.fecha_pago_real || hoyStr
          : form.fecha_pago_real || null;
      const datosGasto = {
        descripcion: form.descripcion,
        categoria_id: categoriaIdFinal,
        medio_pago_id: medioPagoIdFinal,
        miembro_familia_id: miembroIdFinal,
        monto: parseFloat(form.monto),
        fecha_vencimiento: fechaVencimientoFinal,
        fecha_pago_real: fechaPagoReal,
        estado: form.estado,
        es_cuota: form.es_cuota,
        ...(editandoId && form.es_cuota
          ? {
              total_cuotas: parseInt(form.total_cuotas) || null,
              numero_cuota: form.numero_cuota || null,
            }
          : { es_cuota: false }),
      };
      let error;
      if (editandoId) {
        const res = await supabase
          .from("gastos")
          .update(datosGasto)
          .eq("id", editandoId);
        error = res.error;
      } else {
        const res = await supabase.from("gastos").insert(datosGasto);
        error = res.error;
      }
      if (error) {
        alert("No se pudo guardar el gasto.");
        return;
      }
    }
    limpiarFormulario();
    cargarGastos();
  }

  function limpiarFormulario() {
    setForm({
      descripcion: "",
      categoria_id: "",
      categoria_nueva: "",
      medio_pago_id: "",
      medio_pago_nuevo: "",
      miembro_familia_id: "",
      miembro_nuevo: "",
      monto: "",
      fecha_vencimiento: "",
      fecha_pago_real: "",
      estado: "pendiente",
      es_cuota: false,
      cuota_fija: true,
      total_cuotas: "",
      monto_total: "",
      monto_por_cuota: "",
      cuotas_variables: [],
      numero_cuota: null,
    });
    setEditandoId(null);
  }

  function editarGasto(gasto) {
    setForm({
      descripcion: gasto.es_cuota
        ? gasto.descripcion.split(" (")[0]
        : gasto.descripcion || "",
      categoria_id: gasto.categoria_id || "",
      categoria_nueva: "",
      medio_pago_id: gasto.medio_pago_id || "",
      medio_pago_nuevo: "",
      miembro_familia_id: gasto.miembro_familia_id || "",
      miembro_nuevo: "",
      monto: gasto.monto?.toString() || "",
      fecha_vencimiento: gasto.fecha_vencimiento || "",
      fecha_pago_real: gasto.fecha_pago_real || "",
      estado: gasto.estado || "pendiente",
      es_cuota: gasto.es_cuota || false,
      cuota_fija: true,
      total_cuotas: gasto.total_cuotas?.toString() || "",
      monto_total: "",
      monto_por_cuota: "",
      cuotas_variables: [],
      numero_cuota: gasto.numero_cuota || null,
    });
    setEditandoId(gasto.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function eliminarGasto(id, grupoCuotaId) {
    if (grupoCuotaId) {
      const eliminarTodas = window.confirm(
        "Este gasto es parte de un plan de cuotas.\n\nAceptar = eliminar TODAS las cuotas\nCancelar = eliminar solo esta"
      );
      if (eliminarTodas) {
        const { error } = await supabase
          .from("gastos")
          .delete()
          .eq("grupo_cuota_id", grupoCuotaId);
        if (error) {
          alert("No se pudo eliminar.");
          return;
        }
      } else {
        const { error } = await supabase.from("gastos").delete().eq("id", id);
        if (error) {
          alert("No se pudo eliminar.");
          return;
        }
      }
    } else {
      if (!window.confirm("¿Seguro que querés eliminar este gasto?")) return;
      const { error } = await supabase.from("gastos").delete().eq("id", id);
      if (error) {
        alert("No se pudo eliminar.");
        return;
      }
    }
    cargarGastos();
  }

  function formatearMonto(valor) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(valor);
  }

  function formatFecha(fecha) {
    if (!fecha) return null;
    return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR");
  }

  function formatFechaGrupo(fecha) {
    if (!fecha || fecha === "Sin fecha") return "Sin fecha";
    const d = new Date(fecha + "T00:00:00");
    return d.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function renderGastoCard(gasto, index, esBusqueda = false) {
    const esResaltado = esBusqueda && index === resultadoActual;
    return (
      <div
        key={gasto.id}
        ref={
          esBusqueda
            ? (el) => {
                resultadosRef.current[index] = el;
              }
            : null
        }
        className={`gasto-card ${esResaltado ? "gasto-card-resaltado" : ""}`}
      >
        <div className="gasto-info">
          <div className="gasto-titulo">
            <span className="gasto-nombre">
              {gasto.es_cuota
                ? gasto.descripcion.split(" (")[0]
                : gasto.descripcion}
            </span>
            <span
              className={`badge ${
                gasto.estado === "pagado" ? "badge-pagado" : "badge-pendiente"
              }`}
            >
              {gasto.estado === "pagado" ? "Pagado" : "Pendiente"}
            </span>
            {gasto.estado === "pagado" && gasto.fecha_pago_real && (
              <span className="badge-fecha-pago">
                {formatFecha(gasto.fecha_pago_real)}
              </span>
            )}
            {gasto.es_cuota && (
              <span className="badge badge-cuota">
                Cuota {gasto.numero_cuota}/{gasto.total_cuotas}
              </span>
            )}
          </div>
          <span className="gasto-meta">
            {gasto.categoria?.nombre || "Sin categoría"}
            {gasto.medio_pago?.nombre ? ` · ${gasto.medio_pago.nombre}` : ""}
            {gasto.miembro?.nombre ? ` · ${gasto.miembro.nombre}` : ""}
            {" · Vence "}
            {gasto.fecha_vencimiento
              ? formatFecha(gasto.fecha_vencimiento)
              : "Sin vencimiento"}
          </span>
        </div>
        <div className="gasto-acciones">
          <span className="gasto-monto">{formatearMonto(gasto.monto)}</span>
          <button onClick={() => editarGasto(gasto)} className="btn-editar">
            Editar
          </button>
          <button
            onClick={() => eliminarGasto(gasto.id, gasto.grupo_cuota_id)}
            className="btn-eliminar"
          >
            Eliminar
          </button>
        </div>
      </div>
    );
  }

  const totalCuotasVariable = form.cuotas_variables.reduce(
    (acc, c) => acc + (parseFloat(c.monto) || 0),
    0
  );
  const esCuotaEditando = editandoId && form.es_cuota;
  const { recientes, gruposPagados, gruposPendientes } =
    agruparGastos(gastosFiltrados);

  return (
    <div className="container">
      <h1>Gastos</h1>
      <p className="subtitulo">Registrá y controlá los gastos de la casa.</p>

      {/* FORMULARIO */}
      <div className="formulario">
        <h2>
          {editandoId
            ? esCuotaEditando
              ? "Editar cuota"
              : "Editar gasto"
            : "Nuevo gasto"}
        </h2>
        <form onSubmit={manejarEnvio}>
          <div className="grid-2">
            <div className="campo col-span-2">
              <label>Título del gasto</label>
              <input
                type="text"
                name="descripcion"
                value={form.descripcion}
                onChange={manejarCambio}
                placeholder="Ej: Supermercado, Alquiler, Netflix"
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
                  placeholder="Ej: Farmacia"
                  required
                />
              </div>
            )}
            <div className="campo">
              <label>Medio de pago (opcional)</label>
              <select
                name="medio_pago_id"
                value={form.medio_pago_id}
                onChange={manejarCambio}
              >
                <option value="">Sin especificar</option>
                {mediosPago.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
                <option value="nuevo">+ Nuevo medio de pago</option>
              </select>
            </div>
            {form.medio_pago_id === "nuevo" && (
              <div className="campo">
                <label>Nombre del medio de pago</label>
                <input
                  type="text"
                  name="medio_pago_nuevo"
                  value={form.medio_pago_nuevo}
                  onChange={manejarCambio}
                  placeholder="Ej: Tarjeta Visa, Efectivo"
                  required
                />
              </div>
            )}
            <div className="campo">
              <label>¿Quién lo realizó? (opcional)</label>
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
            {esCuotaEditando && (
              <div className="campo">
                <label>Cantidad de cuotas</label>
                <input
                  type="number"
                  name="total_cuotas"
                  value={form.total_cuotas}
                  onChange={manejarCambio}
                  placeholder="Ej: 12"
                  min="1"
                  max="24"
                />
              </div>
            )}
            {!editandoId && (
              <div className="campo col-span-2">
                <label className="label-checkbox">
                  <input
                    type="checkbox"
                    name="es_cuota"
                    checked={form.es_cuota}
                    onChange={manejarCambio}
                  />
                  ¿Es un gasto en cuotas?
                </label>
              </div>
            )}
            {form.es_cuota && !editandoId && (
              <div className="campo col-span-2">
                <label className="label-checkbox">
                  <input
                    type="checkbox"
                    name="cuota_fija"
                    checked={form.cuota_fija}
                    onChange={manejarCambio}
                  />
                  Cuotas de monto fijo
                </label>
              </div>
            )}
            {form.es_cuota && !editandoId ? (
              <>
                <div className="campo col-span-2">
                  <label>
                    Fecha de vencimiento de la primera cuota (opcional)
                  </label>
                  <input
                    type="date"
                    name="fecha_vencimiento"
                    value={form.fecha_vencimiento}
                    onChange={manejarCambio}
                  />
                </div>
                <div className="campo">
                  <label>Cantidad de cuotas (máx. 24)</label>
                  <input
                    type="number"
                    name="total_cuotas"
                    value={form.total_cuotas}
                    onChange={manejarCambio}
                    placeholder="Ej: 12"
                    min="2"
                    max="24"
                    required
                  />
                </div>
                {form.cuota_fija ? (
                  <>
                    <div className="campo">
                      <label>Monto total (opcional)</label>
                      <input
                        type="number"
                        step="0.01"
                        name="monto_total"
                        value={form.monto_total}
                        onChange={manejarCambio}
                        placeholder="Ej: 120000"
                      />
                    </div>
                    <div className="campo">
                      <label>Monto por cuota (opcional)</label>
                      <input
                        type="number"
                        step="0.01"
                        name="monto_por_cuota"
                        value={form.monto_por_cuota}
                        onChange={manejarCambio}
                        placeholder="Ej: 10000"
                      />
                    </div>
                    {form.monto_total &&
                      form.monto_por_cuota &&
                      form.total_cuotas && (
                        <div className="campo col-span-2">
                          <div className="resumen-cuotas">
                            {form.total_cuotas} cuotas de{" "}
                            {formatearMonto(parseFloat(form.monto_por_cuota))} =
                            Total {formatearMonto(parseFloat(form.monto_total))}
                          </div>
                        </div>
                      )}
                  </>
                ) : (
                  form.cuotas_variables.length > 0 && (
                    <div className="campo col-span-2">
                      <label>Monto de cada cuota</label>
                      <div className="cuotas-variables-grid">
                        {form.cuotas_variables.map((c, i) => (
                          <div key={i} className="cuota-variable-fila">
                            <span className="cuota-variable-label">
                              Cuota {c.numero}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              value={c.monto}
                              onChange={(e) =>
                                manejarCuotaVariable(i, e.target.value)
                              }
                              placeholder="0.00"
                              required
                              className="cuota-variable-input"
                            />
                          </div>
                        ))}
                      </div>
                      {totalCuotasVariable > 0 && (
                        <div
                          className="resumen-cuotas"
                          style={{ marginTop: "12px" }}
                        >
                          Total del plan: {formatearMonto(totalCuotasVariable)}
                        </div>
                      )}
                    </div>
                  )
                )}
              </>
            ) : (
              <>
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
                  <label>Estado</label>
                  <select
                    name="estado"
                    value={form.estado}
                    onChange={manejarCambio}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                  </select>
                </div>
                <div className="campo">
                  <label>Fecha de vencimiento (opcional)</label>
                  <input
                    type="date"
                    name="fecha_vencimiento"
                    value={form.fecha_vencimiento}
                    onChange={manejarCambio}
                  />
                </div>
                <div className="campo">
                  <label>Fecha real de pago (opcional)</label>
                  <input
                    type="date"
                    name="fecha_pago_real"
                    value={form.fecha_pago_real}
                    onChange={manejarCambio}
                  />
                </div>
              </>
            )}
          </div>
          <div className="botones">
            <button type="submit" className="btn-primary">
              {editandoId
                ? "Guardar cambios"
                : form.es_cuota
                ? "Generar cuotas"
                : "Agregar gasto"}
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

      {/* FILTROS */}
      <div className="filtro-mes" style={{ marginBottom: "16px" }}>
        <div className="filtro-grupo">
          <label className="filtro-label">
            <input
              type="checkbox"
              checked={filtrarPorMes}
              onChange={(e) => setFiltrarPorMes(e.target.checked)}
              style={{ marginRight: "6px", accentColor: "#818cf8" }}
            />
            Filtrar por mes
          </label>
        </div>
        {filtrarPorMes && (
          <>
            <div className="filtro-grupo">
              <label className="filtro-label">Mes</label>
              <select
                value={filtroMes}
                onChange={(e) => setFiltroMes(parseInt(e.target.value))}
                className="filtro-select"
              >
                {meses.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="filtro-grupo">
              <label className="filtro-label">Año</label>
              <select
                value={filtroAnio}
                onChange={(e) => setFiltroAnio(parseInt(e.target.value))}
                className="filtro-select"
              >
                {anios.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="filtro-grupo">
          <label className="filtro-label">Estado</label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="filtro-select"
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="pagado">Pagados</option>
          </select>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="buscador-container">
        <div className="buscador-fila">
          <input
            type="text"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Buscar por descripción o categoría..."
            className="buscador-input"
          />
          <button onClick={buscar} className="btn-buscar">
            Buscar
          </button>
          {busquedaActiva && (
            <button onClick={limpiarBusqueda} className="btn-limpiar">
              ✕
            </button>
          )}
        </div>
        {busquedaActiva && (
          <div className="buscador-nav">
            <span className="buscador-resultados">
              {totalResultados === 0
                ? "Sin resultados"
                : `${resultadoActual + 1} de ${totalResultados} resultado${
                    totalResultados !== 1 ? "s" : ""
                  }`}
            </span>
            {totalResultados > 1 && (
              <div className="buscador-flechas">
                <button onClick={irAnterior} className="btn-flecha">
                  ←
                </button>
                <button onClick={irSiguiente} className="btn-flecha">
                  →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* LISTADO */}
      <h2>Gastos cargados</h2>
      {cargando && <p className="texto-cargando">Cargando gastos...</p>}
      {!cargando && gastosFiltrados.length === 0 && (
        <p className="texto-vacio">
          {busquedaActiva
            ? "No se encontraron gastos."
            : "No hay gastos para mostrar."}
        </p>
      )}

      {!cargando && !busquedaActiva && (
        <>
          {/* PAGADOS ÚLTIMOS 3 DÍAS */}
          {recientes.length > 0 && (
            <>
              <div className="grupo-fecha-header">
                <span className="grupo-fecha-titulo">🕐 Últimos 3 días</span>
              </div>
              <div className="lista" style={{ marginBottom: "16px" }}>
                {recientes.map((g) => renderGastoCard(g))}
              </div>
            </>
          )}

          {/* PAGADOS AGRUPADOS POR FECHA - DESPLEGABLES */}
          {Object.keys(gruposPagados).length > 0 &&
            Object.entries(gruposPagados).map(([fecha, items]) => (
              <GrupoFecha
                key={fecha}
                fecha={formatFechaGrupo(fecha)}
                items={items}
                total={items.reduce(
                  (acc, g) => acc + parseFloat(g.monto || 0),
                  0
                )}
                formatearMonto={formatearMonto}
                renderCard={renderGastoCard}
                esPendiente={false}
              />
            ))}

          {/* PENDIENTES AGRUPADOS POR FECHA VENCIMIENTO - DESPLEGABLES */}
          {Object.keys(gruposPendientes).length > 0 &&
            Object.entries(gruposPendientes).map(([fecha, items]) => (
              <GrupoFecha
                key={fecha}
                fecha={`⏳ Vence ${formatFechaGrupo(fecha)}`}
                items={items}
                total={items.reduce(
                  (acc, g) => acc + parseFloat(g.monto || 0),
                  0
                )}
                formatearMonto={formatearMonto}
                renderCard={renderGastoCard}
                esPendiente={true}
              />
            ))}
        </>
      )}

      {/* RESULTADOS DE BÚSQUEDA */}
      {!cargando && busquedaActiva && (
        <div className="lista">
          {gastosFiltrados.map((gasto, index) =>
            renderGastoCard(gasto, index, true)
          )}
        </div>
      )}
    </div>
  );
}
