import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

export default function ResumenModule() {
  const hoy = new Date();
  const [mesSeleccionado, setMesSeleccionado] = useState(hoy.getMonth());
  const [anioSeleccionado, setAnioSeleccionado] = useState(hoy.getFullYear());
  const [miembroFiltro, setMiembroFiltro] = useState("todos");
  const [miembros, setMiembros] = useState([]);
  const [ingresos, setIngresos] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [vencimientos, setVencimientos] = useState([]);
  const [planesCuotas, setPlanesCuotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [modoComparar, setModoComparar] = useState(false);
  const [mesComparar, setMesComparar] = useState(
    hoy.getMonth() === 0 ? 11 : hoy.getMonth() - 1
  );
  const [anioComparar, setAnioComparar] = useState(
    hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear()
  );
  const [ingresosB, setIngresosB] = useState([]);
  const [gastosB, setGastosB] = useState([]);

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

  const COLORES = [
    "#047857",
    "#0369a1",
    "#7c3aed",
    "#b45309",
    "#be185d",
    "#0f766e",
    "#1d4ed8",
    "#6d28d9",
    "#92400e",
    "#9d174d",
    "#065f46",
    "#075985",
    "#5b21b6",
    "#78350f",
    "#831843",
  ];

  useEffect(() => {
    cargarMiembros();
  }, []);
  useEffect(() => {
    cargarDatos();
  }, [mesSeleccionado, anioSeleccionado, miembroFiltro]);
  useEffect(() => {
    if (modoComparar) cargarDatosComparacion();
  }, [modoComparar, mesComparar, anioComparar, miembroFiltro]);

  useEffect(() => {
    const canalGastos = supabase
      .channel("resumen-gastos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gastos" },
        () => cargarDatos()
      )
      .subscribe();
    const canalIngresos = supabase
      .channel("resumen-ingresos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ingresos" },
        () => cargarDatos()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canalGastos);
      supabase.removeChannel(canalIngresos);
    };
  }, []);

  async function cargarMiembros() {
    const { data } = await supabase
      .from("categorias")
      .select("*")
      .eq("tipo", "miembro_familia")
      .order("nombre");
    setMiembros(data || []);
  }

  function rangoMes(mes, anio) {
    return {
      desde: new Date(anio, mes, 1).toISOString().split("T")[0],
      hasta: new Date(anio, mes + 1, 0).toISOString().split("T")[0],
    };
  }

  async function cargarDatos() {
    setCargando(true);
    const { desde, hasta } = rangoMes(mesSeleccionado, anioSeleccionado);

    let queryIngresos = supabase
      .from("ingresos")
      .select(
        "*, categoria:categoria_id(nombre), miembro:miembro_familia_id(nombre)"
      )
      .gte("fecha", desde)
      .lte("fecha", hasta);

    let queryGastos = supabase
      .from("gastos")
      .select(
        "*, categoria:categoria_id(nombre), medio_pago:medio_pago_id(nombre), miembro:miembro_familia_id(nombre)"
      )
      .gte("fecha_vencimiento", desde)
      .lte("fecha_vencimiento", hasta)
      .eq("es_cuota", false);

    if (miembroFiltro !== "todos") {
      queryIngresos = queryIngresos.eq("miembro_familia_id", miembroFiltro);
      queryGastos = queryGastos.eq("miembro_familia_id", miembroFiltro);
    }

    const [{ data: ing }, { data: gas }, { data: cuotas }, { data: venc }] =
      await Promise.all([
        queryIngresos,
        queryGastos,
        supabase
          .from("gastos")
          .select("*, categoria:categoria_id(nombre)")
          .eq("es_cuota", true),
        supabase
          .from("gastos")
          .select("*, categoria:categoria_id(nombre)")
          .eq("estado", "pendiente")
          .order("fecha_vencimiento", { ascending: true }),
      ]);

    setIngresos(ing || []);
    setGastos(gas || []);
    setVencimientos(venc || []);
    procesarPlanesCuotas(cuotas || []);
    setCargando(false);
  }

  async function cargarDatosComparacion() {
    const { desde, hasta } = rangoMes(mesComparar, anioComparar);
    let queryIngresos = supabase
      .from("ingresos")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta);
    let queryGastos = supabase
      .from("gastos")
      .select("*")
      .gte("fecha_vencimiento", desde)
      .lte("fecha_vencimiento", hasta)
      .eq("es_cuota", false);
    if (miembroFiltro !== "todos") {
      queryIngresos = queryIngresos.eq("miembro_familia_id", miembroFiltro);
      queryGastos = queryGastos.eq("miembro_familia_id", miembroFiltro);
    }
    const [{ data: ing }, { data: gas }] = await Promise.all([
      queryIngresos,
      queryGastos,
    ]);
    setIngresosB(ing || []);
    setGastosB(gas || []);
  }

  function procesarPlanesCuotas(todasLasCuotas) {
    const grupos = {};
    todasLasCuotas.forEach((c) => {
      if (!c.grupo_cuota_id) return;
      if (!grupos[c.grupo_cuota_id]) grupos[c.grupo_cuota_id] = [];
      grupos[c.grupo_cuota_id].push(c);
    });
    const planes = Object.entries(grupos).map(([grupoId, cuotas]) => {
      const pagadas = cuotas.filter((c) => c.estado === "pagado");
      const pendientes = cuotas.filter((c) => c.estado === "pendiente");
      const totalPlan = cuotas.reduce(
        (acc, c) => acc + parseFloat(c.monto || 0),
        0
      );
      const totalPagado = pagadas.reduce(
        (acc, c) => acc + parseFloat(c.monto || 0),
        0
      );
      const totalPendiente = pendientes.reduce(
        (acc, c) => acc + parseFloat(c.monto || 0),
        0
      );
      const nombreBase = cuotas[0]?.descripcion?.split(" (")[0] || "Sin nombre";
      const totalCuotas = cuotas[0]?.total_cuotas || cuotas.length;
      const proximaVenc = [...pendientes].sort(
        (a, b) => new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento)
      )[0];
      return {
        grupoId,
        nombreBase,
        totalCuotas,
        cantPagadas: pagadas.length,
        cantPendientes: pendientes.length,
        totalPlan,
        totalPagado,
        totalPendiente,
        proximaVenc,
      };
    });
    planes.sort((a, b) => b.cantPendientes - a.cantPendientes);
    setPlanesCuotas(planes);
  }

  function formatearMonto(valor) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(valor);
  }

  function etiquetaMes(mes, anio) {
    return `${meses[mes]} ${anio}`;
  }

  function formatFecha(fecha) {
    if (!fecha) return "-";
    return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR");
  }

  const totalIngresos = ingresos.reduce(
    (acc, i) => acc + parseFloat(i.monto || 0),
    0
  );
  const totalGastos = gastos.reduce(
    (acc, g) => acc + parseFloat(g.monto || 0),
    0
  );
  const saldo = totalIngresos - totalGastos;
  const totalIngresosB = ingresosB.reduce(
    (acc, i) => acc + parseFloat(i.monto || 0),
    0
  );
  const totalGastosB = gastosB.reduce(
    (acc, g) => acc + parseFloat(g.monto || 0),
    0
  );
  const saldoB = totalIngresosB - totalGastosB;

  function diferencia(a, b) {
    const diff = a - b;
    return `${diff >= 0 ? "+" : ""}${formatearMonto(diff)}`;
  }

  function datosGrafico() {
    const agrupado = {};
    gastos.forEach((g) => {
      const nombre = g.categoria?.nombre || "Sin categoría";
      agrupado[nombre] = (agrupado[nombre] || 0) + parseFloat(g.monto || 0);
    });
    return Object.entries(agrupado)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value);
  }

  // ---- EXPORTAR EXCEL ----
  async function exportarExcel() {
    setExportando(true);
    try {
      const wb = XLSX.utils.book_new();
      const periodos = modoComparar
        ? [
            { mes: mesSeleccionado, anio: anioSeleccionado },
            { mes: mesComparar, anio: anioComparar },
          ]
        : [{ mes: mesSeleccionado, anio: anioSeleccionado }];

      // HOJA RESUMEN
      const resumenData = [
        ["RESUMEN DE FINANZAS"],
        ["Generado el", new Date().toLocaleDateString("es-AR")],
        [],
      ];

      periodos.forEach(({ mes, anio }) => {
        const { desde, hasta } = rangoMes(mes, anio);
        const esPeriodoA = mes === mesSeleccionado && anio === anioSeleccionado;
        const ing = esPeriodoA ? totalIngresos : totalIngresosB;
        const gas = esPeriodoA ? totalGastos : totalGastosB;
        const sal = ing - gas;

        resumenData.push([
          `Período: ${etiquetaMes(mes, anio)}`,
          `Desde: ${desde}`,
          `Hasta: ${hasta}`,
        ]);
        resumenData.push(["Concepto", "Monto"]);
        resumenData.push(["Total Ingresos", ing]);
        resumenData.push(["Total Gastos", gas]);
        resumenData.push(["Saldo", sal]);
        resumenData.push([]);
      });

      if (modoComparar) {
        resumenData.push(["COMPARACIÓN"]);
        resumenData.push([
          "Concepto",
          etiquetaMes(mesSeleccionado, anioSeleccionado),
          etiquetaMes(mesComparar, anioComparar),
          "Diferencia",
        ]);
        resumenData.push([
          "Ingresos",
          totalIngresos,
          totalIngresosB,
          totalIngresos - totalIngresosB,
        ]);
        resumenData.push([
          "Gastos",
          totalGastos,
          totalGastosB,
          totalGastos - totalGastosB,
        ]);
        resumenData.push(["Saldo", saldo, saldoB, saldo - saldoB]);
        resumenData.push([]);
      }

      // Gastos por categoría
      resumenData.push([
        "GASTOS POR CATEGORÍA",
        `(${etiquetaMes(mesSeleccionado, anioSeleccionado)})`,
      ]);
      resumenData.push(["Categoría", "Monto", "% del total"]);
      datosGrafico().forEach(({ name, value }) => {
        resumenData.push([
          name,
          value,
          totalGastos > 0
            ? `${Math.round((value / totalGastos) * 100)}%`
            : "0%",
        ]);
      });
      resumenData.push([]);

      // Planes de cuotas
      resumenData.push(["PLANES DE CUOTAS"]);
      resumenData.push([
        "Plan",
        "Total cuotas",
        "Pagadas",
        "Pendientes",
        "Total plan",
        "Pagado",
        "Pendiente",
        "Próx. vencimiento",
      ]);
      planesCuotas.forEach((p) => {
        resumenData.push([
          p.nombreBase,
          p.totalCuotas,
          p.cantPagadas,
          p.cantPendientes,
          p.totalPlan,
          p.totalPagado,
          p.totalPendiente,
          p.proximaVenc
            ? formatFecha(p.proximaVenc.fecha_vencimiento)
            : "Finalizado",
        ]);
      });

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(resumenData),
        "Resumen"
      );

      // HOJA GASTOS
      const gastosData = [
        ["GASTOS", etiquetaMes(mesSeleccionado, anioSeleccionado)],
        [],
        [
          "Descripción",
          "Categoría",
          "Medio de pago",
          "Quién",
          "Monto",
          "Vencimiento",
          "Fecha pago real",
          "Estado",
        ],
      ];
      gastos.forEach((g) => {
        gastosData.push([
          g.descripcion,
          g.categoria?.nombre || "-",
          g.medio_pago?.nombre || "-",
          g.miembro?.nombre || "-",
          parseFloat(g.monto),
          formatFecha(g.fecha_vencimiento),
          formatFecha(g.fecha_pago_real),
          g.estado,
        ]);
      });
      gastosData.push([]);
      gastosData.push(["", "", "", "TOTAL", totalGastos]);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(gastosData),
        "Gastos"
      );

      // HOJA INGRESOS
      const ingresosData = [
        ["INGRESOS", etiquetaMes(mesSeleccionado, anioSeleccionado)],
        [],
        ["Descripción", "Categoría", "Quién", "Monto", "Fecha"],
      ];
      ingresos.forEach((i) => {
        ingresosData.push([
          i.descripcion,
          i.categoria?.nombre || "-",
          i.miembro?.nombre || "-",
          parseFloat(i.monto),
          formatFecha(i.fecha),
        ]);
      });
      ingresosData.push([]);
      ingresosData.push(["", "", "TOTAL", totalIngresos]);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(ingresosData),
        "Ingresos"
      );

      // HOJA VENCIMIENTOS
      const gruposVistos = new Set();
      const vencFiltrados = vencimientos.filter((g) => {
        if (!g.es_cuota || !g.grupo_cuota_id) return true;
        if (gruposVistos.has(g.grupo_cuota_id)) return false;
        gruposVistos.add(g.grupo_cuota_id);
        return true;
      });

      const vencData = [
        ["VENCIMIENTOS PENDIENTES"],
        [],
        [
          "Descripción",
          "Categoría",
          "Monto",
          "Vencimiento",
          "Días restantes",
          "Es cuota",
          "Cuota N°",
        ],
      ];
      vencFiltrados.forEach((g) => {
        const hoyDate = new Date();
        hoyDate.setHours(0, 0, 0, 0);
        const vence = new Date(g.fecha_vencimiento + "T00:00:00");
        const dias = Math.ceil((vence - hoyDate) / (1000 * 60 * 60 * 24));
        vencData.push([
          g.es_cuota ? g.descripcion.split(" (")[0] : g.descripcion,
          g.categoria?.nombre || "-",
          parseFloat(g.monto),
          formatFecha(g.fecha_vencimiento),
          dias < 0
            ? `Vencido hace ${Math.abs(dias)} días`
            : dias === 0
            ? "Hoy"
            : `En ${dias} días`,
          g.es_cuota ? "Sí" : "No",
          g.es_cuota ? `${g.numero_cuota}/${g.total_cuotas}` : "-",
        ]);
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(vencData),
        "Vencimientos"
      );

      // Generar nombre del archivo
      const nombreArchivo = modoComparar
        ? `finanzas_${meses[mesSeleccionado]}_vs_${meses[mesComparar]}_${anioSeleccionado}.xlsx`
        : `finanzas_${meses[mesSeleccionado]}_${anioSeleccionado}.xlsx`;

      XLSX.writeFile(wb, nombreArchivo);
    } catch (err) {
      console.error("Error al exportar Excel:", err);
      alert("No se pudo exportar el archivo Excel.");
    }
    setExportando(false);
  }

  // ---- EXPORTAR PDF ----
  async function exportarPDF() {
    setExportando(true);
    try {
      const doc = new jsPDF();
      const margen = 14;
      let y = 20;

      function titulo(texto, size = 14) {
        doc.setFontSize(size);
        doc.setFont("helvetica", "bold");
        doc.text(texto, margen, y);
        y += size === 14 ? 8 : 6;
      }

      function subtitulo(texto) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        doc.text(texto, margen, y);
        doc.setTextColor(0, 0, 0);
        y += 6;
      }

      function salto(n = 6) {
        y += n;
      }

      function tabla(columnas, filas) {
        doc.autoTable({
          startY: y,
          head: [columnas],
          body: filas,
          margin: { left: margen, right: margen },
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: {
            fillColor: [4, 120, 87],
            textColor: 255,
            fontStyle: "bold",
          },
          alternateRowStyles: { fillColor: [245, 245, 244] },
          didDrawPage: (data) => {
            y = data.cursor.y + 6;
          },
        });
        y = doc.lastAutoTable.finalY + 8;
      }

      // PORTADA
      titulo(
        `Finanzas del Hogar — ${etiquetaMes(
          mesSeleccionado,
          anioSeleccionado
        )}`,
        16
      );
      subtitulo(`Generado el ${new Date().toLocaleDateString("es-AR")}`);
      salto(4);

      // RESUMEN
      titulo("Resumen del período");
      tabla(
        ["Concepto", "Monto"],
        [
          ["Total Ingresos", formatearMonto(totalIngresos)],
          ["Total Gastos", formatearMonto(totalGastos)],
          ["Saldo", formatearMonto(saldo)],
        ]
      );

      if (modoComparar) {
        titulo("Comparación de meses");
        tabla(
          [
            "Concepto",
            etiquetaMes(mesSeleccionado, anioSeleccionado),
            etiquetaMes(mesComparar, anioComparar),
            "Diferencia",
          ],
          [
            [
              "Ingresos",
              formatearMonto(totalIngresos),
              formatearMonto(totalIngresosB),
              diferencia(totalIngresos, totalIngresosB),
            ],
            [
              "Gastos",
              formatearMonto(totalGastos),
              formatearMonto(totalGastosB),
              diferencia(totalGastos, totalGastosB),
            ],
            [
              "Saldo",
              formatearMonto(saldo),
              formatearMonto(saldoB),
              diferencia(saldo, saldoB),
            ],
          ]
        );
      }

      // GASTOS POR CATEGORÍA
      if (datosGrafico().length > 0) {
        titulo("Gastos por categoría");
        tabla(
          ["Categoría", "Monto", "% del total"],
          datosGrafico().map(({ name, value }) => [
            name,
            formatearMonto(value),
            totalGastos > 0
              ? `${Math.round((value / totalGastos) * 100)}%`
              : "0%",
          ])
        );
      }

      // GASTOS
      doc.addPage();
      y = 20;
      titulo(`Gastos — ${etiquetaMes(mesSeleccionado, anioSeleccionado)}`);
      tabla(
        [
          "Descripción",
          "Categoría",
          "Medio pago",
          "Quién",
          "Monto",
          "Vencimiento",
          "Estado",
        ],
        gastos.map((g) => [
          g.descripcion,
          g.categoria?.nombre || "-",
          g.medio_pago?.nombre || "-",
          g.miembro?.nombre || "-",
          formatearMonto(g.monto),
          formatFecha(g.fecha_vencimiento),
          g.estado,
        ])
      );
      titulo(`Total gastos: ${formatearMonto(totalGastos)}`, 10);

      // INGRESOS
      doc.addPage();
      y = 20;
      titulo(`Ingresos — ${etiquetaMes(mesSeleccionado, anioSeleccionado)}`);
      tabla(
        ["Descripción", "Categoría", "Quién", "Monto", "Fecha"],
        ingresos.map((i) => [
          i.descripcion,
          i.categoria?.nombre || "-",
          i.miembro?.nombre || "-",
          formatearMonto(i.monto),
          formatFecha(i.fecha),
        ])
      );
      titulo(`Total ingresos: ${formatearMonto(totalIngresos)}`, 10);

      // VENCIMIENTOS
      doc.addPage();
      y = 20;
      titulo("Vencimientos pendientes");
      const gruposVistos = new Set();
      const vencFiltrados = vencimientos.filter((g) => {
        if (!g.es_cuota || !g.grupo_cuota_id) return true;
        if (gruposVistos.has(g.grupo_cuota_id)) return false;
        gruposVistos.add(g.grupo_cuota_id);
        return true;
      });
      tabla(
        ["Descripción", "Categoría", "Monto", "Vencimiento", "Días", "Cuota"],
        vencFiltrados.map((g) => {
          const hoyDate = new Date();
          hoyDate.setHours(0, 0, 0, 0);
          const vence = new Date(g.fecha_vencimiento + "T00:00:00");
          const dias = Math.ceil((vence - hoyDate) / (1000 * 60 * 60 * 24));
          return [
            g.es_cuota ? g.descripcion.split(" (")[0] : g.descripcion,
            g.categoria?.nombre || "-",
            formatearMonto(g.monto),
            formatFecha(g.fecha_vencimiento),
            dias < 0
              ? `Vencido ${Math.abs(dias)}d`
              : dias === 0
              ? "Hoy"
              : `${dias}d`,
            g.es_cuota ? `${g.numero_cuota}/${g.total_cuotas}` : "-",
          ];
        })
      );

      // PLANES DE CUOTAS
      if (planesCuotas.length > 0) {
        titulo("Planes de cuotas");
        tabla(
          [
            "Plan",
            "Total",
            "Pagadas",
            "Pendientes",
            "Pagado",
            "Pendiente",
            "Próx. venc.",
          ],
          planesCuotas.map((p) => [
            p.nombreBase,
            p.totalCuotas,
            p.cantPagadas,
            p.cantPendientes,
            formatearMonto(p.totalPagado),
            formatearMonto(p.totalPendiente),
            p.proximaVenc
              ? formatFecha(p.proximaVenc.fecha_vencimiento)
              : "Finalizado",
          ])
        );
      }

      const nombreArchivo = modoComparar
        ? `finanzas_${meses[mesSeleccionado]}_vs_${meses[mesComparar]}_${anioSeleccionado}.pdf`
        : `finanzas_${meses[mesSeleccionado]}_${anioSeleccionado}.pdf`;

      doc.save(nombreArchivo);
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      alert("No se pudo exportar el archivo PDF.");
    }
    setExportando(false);
  }

  function TooltipPersonalizado({ active, payload }) {
    if (active && payload && payload.length) {
      return (
        <div className="grafico-tooltip">
          <p className="grafico-tooltip-nombre">{payload[0].name}</p>
          <p className="grafico-tooltip-monto">
            {formatearMonto(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  }

  const datosGraf = datosGrafico();
  const nombreMiembroActivo =
    miembroFiltro === "todos"
      ? null
      : miembros.find((m) => m.id === miembroFiltro)?.nombre;

  return (
    <div className="container">
      <h1>Resumen</h1>
      <p className="subtitulo">Panorama general de tus finanzas.</p>

      {/* FILTROS */}
      <div className="filtro-mes">
        <div className="filtro-grupo">
          <label className="filtro-label">Mes</label>
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(parseInt(e.target.value))}
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
            value={anioSeleccionado}
            onChange={(e) => setAnioSeleccionado(parseInt(e.target.value))}
            className="filtro-select"
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">Miembro</label>
          <select
            value={miembroFiltro}
            onChange={(e) => setMiembroFiltro(e.target.value)}
            className="filtro-select"
          >
            <option value="todos">Todos</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="filtro-grupo" style={{ justifyContent: "flex-end" }}>
          <label className="label-checkbox" style={{ marginTop: "22px" }}>
            <input
              type="checkbox"
              checked={modoComparar}
              onChange={(e) => setModoComparar(e.target.checked)}
            />
            Comparar con otro mes
          </label>
        </div>
      </div>

      {modoComparar && (
        <div className="filtro-mes filtro-comparar">
          <span
            className="filtro-label"
            style={{ alignSelf: "center", paddingTop: "16px" }}
          >
            Comparar con:
          </span>
          <div className="filtro-grupo">
            <label className="filtro-label">Mes</label>
            <select
              value={mesComparar}
              onChange={(e) => setMesComparar(parseInt(e.target.value))}
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
              value={anioComparar}
              onChange={(e) => setAnioComparar(parseInt(e.target.value))}
              className="filtro-select"
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* BOTONES DE EXPORTACIÓN */}
      {!cargando && (
        <div className="export-botones">
          <button
            onClick={exportarExcel}
            disabled={exportando}
            className="btn-export btn-export-excel"
          >
            {exportando ? "Exportando..." : "⬇ Exportar Excel"}
          </button>
          <button
            onClick={exportarPDF}
            disabled={exportando}
            className="btn-export btn-export-pdf"
          >
            {exportando ? "Exportando..." : "⬇ Exportar PDF"}
          </button>
        </div>
      )}

      {cargando && <p className="texto-cargando">Cargando resumen...</p>}

      {!cargando && (
        <>
          {!modoComparar ? (
            <>
              <h2>
                Balance de {etiquetaMes(mesSeleccionado, anioSeleccionado)}
                {nombreMiembroActivo && (
                  <span className="filtro-miembro-activo">
                    {" "}
                    · {nombreMiembroActivo}
                  </span>
                )}
              </h2>
              <div className="resumen-cards-grid">
                <div className="resumen-big-card resumen-big-ingreso">
                  <span className="resumen-big-label">Ingresos</span>
                  <span className="resumen-big-monto">
                    {formatearMonto(totalIngresos)}
                  </span>
                  <span className="resumen-big-sub">
                    {ingresos.length} registro{ingresos.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="resumen-big-card resumen-big-gasto">
                  <span className="resumen-big-label">Gastos</span>
                  <span className="resumen-big-monto">
                    {formatearMonto(totalGastos)}
                  </span>
                  <span className="resumen-big-sub">
                    {gastos.length} registro{gastos.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  className={`resumen-big-card ${
                    saldo >= 0 ? "resumen-big-positivo" : "resumen-big-negativo"
                  }`}
                >
                  <span className="resumen-big-label">Saldo</span>
                  <span className="resumen-big-monto">
                    {formatearMonto(saldo)}
                  </span>
                  <span className="resumen-big-sub">
                    {saldo >= 0 ? "Positivo ✓" : "Negativo ✗"}
                  </span>
                </div>
              </div>

              {datosGraf.length > 0 && (
                <div className="grafico-container">
                  <h2>Gastos por categoría</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={datosGraf}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {datosGraf.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORES[index % COLORES.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipPersonalizado />} />
                      <Legend
                        formatter={(value, entry) => (
                          <span
                            style={{ fontSize: "0.85rem", color: "#44403c" }}
                          >
                            {value} ({formatearMonto(entry.payload.value)})
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="categorias-tabla">
                    {datosGraf.map((item, index) => (
                      <div key={item.name} className="categoria-fila">
                        <div className="categoria-fila-izq">
                          <span
                            className="categoria-color"
                            style={{
                              background: COLORES[index % COLORES.length],
                            }}
                          ></span>
                          <span className="categoria-nombre">{item.name}</span>
                        </div>
                        <div className="categoria-fila-der">
                          <span className="categoria-monto">
                            {formatearMonto(item.value)}
                          </span>
                          <span className="categoria-porcentaje">
                            {totalGastos > 0
                              ? Math.round((item.value / totalGastos) * 100)
                              : 0}
                            %
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <h2>
                Comparación de meses
                {nombreMiembroActivo && (
                  <span className="filtro-miembro-activo">
                    {" "}
                    · {nombreMiembroActivo}
                  </span>
                )}
              </h2>
              <div className="comparar-tabla">
                <div className="comparar-header">
                  <span></span>
                  <span className="comparar-col-title">
                    {etiquetaMes(mesSeleccionado, anioSeleccionado)}
                  </span>
                  <span className="comparar-col-title">
                    {etiquetaMes(mesComparar, anioComparar)}
                  </span>
                  <span className="comparar-col-title">Diferencia</span>
                </div>
                <div className="comparar-fila comparar-fila-ingreso">
                  <span className="comparar-label">Ingresos</span>
                  <span>{formatearMonto(totalIngresos)}</span>
                  <span>{formatearMonto(totalIngresosB)}</span>
                  <span
                    className={
                      totalIngresos - totalIngresosB >= 0
                        ? "diff-positivo"
                        : "diff-negativo"
                    }
                  >
                    {diferencia(totalIngresos, totalIngresosB)}
                  </span>
                </div>
                <div className="comparar-fila comparar-fila-gasto">
                  <span className="comparar-label">Gastos</span>
                  <span>{formatearMonto(totalGastos)}</span>
                  <span>{formatearMonto(totalGastosB)}</span>
                  <span
                    className={
                      totalGastos - totalGastosB <= 0
                        ? "diff-positivo"
                        : "diff-negativo"
                    }
                  >
                    {diferencia(totalGastos, totalGastosB)}
                  </span>
                </div>
                <div className="comparar-fila comparar-fila-saldo">
                  <span className="comparar-label">Saldo</span>
                  <span
                    className={saldo >= 0 ? "diff-positivo" : "diff-negativo"}
                  >
                    {formatearMonto(saldo)}
                  </span>
                  <span
                    className={saldoB >= 0 ? "diff-positivo" : "diff-negativo"}
                  >
                    {formatearMonto(saldoB)}
                  </span>
                  <span
                    className={
                      saldo - saldoB >= 0 ? "diff-positivo" : "diff-negativo"
                    }
                  >
                    {diferencia(saldo, saldoB)}
                  </span>
                </div>
              </div>
            </>
          )}

          {/* PLANES DE CUOTAS */}
          <h2 style={{ marginTop: "32px" }}>Planes de cuotas</h2>
          {planesCuotas.length === 0 && (
            <p className="texto-vacio">No hay planes de cuotas cargados.</p>
          )}
          <div className="lista">
            {planesCuotas.map((plan) => (
              <div
                key={plan.grupoId}
                className={`plan-cuota-card ${
                  plan.cantPendientes === 0 ? "plan-finalizado" : ""
                }`}
              >
                <div className="plan-cuota-header">
                  <span className="plan-cuota-nombre">{plan.nombreBase}</span>
                  {plan.cantPendientes === 0 ? (
                    <span className="badge badge-pagado">Finalizado</span>
                  ) : (
                    <span className="badge badge-pendiente">
                      {plan.cantPendientes} pendiente
                      {plan.cantPendientes !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="plan-cuota-detalle">
                  <div className="plan-cuota-fila">
                    <span className="plan-cuota-label">Cuotas pagadas</span>
                    <span className="plan-cuota-valor diff-positivo">
                      {plan.cantPagadas}/{plan.totalCuotas} ·{" "}
                      {formatearMonto(plan.totalPagado)}
                    </span>
                  </div>
                  <div className="plan-cuota-fila">
                    <span className="plan-cuota-label">Cuotas impagas</span>
                    <span className="plan-cuota-valor diff-negativo">
                      {plan.cantPendientes}/{plan.totalCuotas} ·{" "}
                      {formatearMonto(plan.totalPendiente)}
                    </span>
                  </div>
                  <div className="plan-cuota-fila">
                    <span className="plan-cuota-label">Total del plan</span>
                    <span className="plan-cuota-valor">
                      {formatearMonto(plan.totalPlan)}
                    </span>
                  </div>
                  {plan.proximaVenc && (
                    <div className="plan-cuota-fila">
                      <span className="plan-cuota-label">
                        Próximo vencimiento
                      </span>
                      <span className="plan-cuota-valor">
                        Cuota {plan.proximaVenc.numero_cuota} ·{" "}
                        {formatFecha(plan.proximaVenc.fecha_vencimiento)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
