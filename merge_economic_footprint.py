# merge_economic_footprint.py
from pathlib import Path
import sys
import pandas as pd

def read_csv_robust(csv_path: Path) -> pd.DataFrame:
    """
    Lee CSV con detección flexible de separador y BOM.
    Requiere columnas: Date, Average
    """
    try:
        # sep=None usa motor python para detectar delimitador automáticamente
        df = pd.read_csv(csv_path, sep=None, engine="python", encoding="utf-8-sig")
    except Exception:
        # reintento simple en caso de delimitador ';'
        df = pd.read_csv(csv_path, sep=";", encoding="utf-8-sig")

    # Normaliza encabezados por si tienen espacios/casos distintos
    df.columns = [c.strip() for c in df.columns]

    # Validación mínima
    required = {"Date", "Average"}
    if not required.issubset(df.columns):
        raise ValueError(
            f"{csv_path} no tiene las columnas requeridas {required}. "
            f"Columnas encontradas: {list(df.columns)}"
        )
    return df[["Date", "Average"]]

def main(root_folder: Path):
    if not root_folder.exists() or not root_folder.is_dir():
        raise SystemExit(f"La ruta no existe o no es carpeta: {root_folder}")

    # Busca subcarpetas que contengan un archivo llamado exactamente "Economic footprint.csv"
    pairs = []
    for sub in sorted([p for p in root_folder.iterdir() if p.is_dir()]):
        # match exacto, tolerante a mayúsculas/minúsculas
        candidates = [p for p in sub.glob("*") if p.name.lower() == "economic footprint.csv"]
        if not candidates:
            continue
        csv_path = candidates[0]
        df = read_csv_robust(csv_path)
        # Renombra Average con el nombre de la carpeta
        df = df.rename(columns={"Average": sub.name})
        pairs.append((sub.name, df))

    if not pairs:
        raise SystemExit("No se encontraron 'Economic footprint.csv' en subcarpetas.")

    # Arranca con la primera como base
    base_name, base_df = pairs[0]
    # normaliza Date a string para evitar discrepancias de tipos
    base_df["Date"] = base_df["Date"].astype(str)

    # Unimos por Date; como dijiste que Date es igual en todos, inner basta.
    # Para máxima seguridad podríamos usar outer y avisar diferencias; aquí usamos inner.
    merged = base_df.copy()
    for name, df in pairs[1:]:
        df["Date"] = df["Date"].astype(str)
        # Validación opcional: verificar igualdad de series Date
        if not df["Date"].equals(merged["Date"]):
            # Si no coinciden exactamente, hacemos merge outer y ordenamos, dejando NaN donde falte.
            merged = pd.merge(merged, df, on="Date", how="outer")
        else:
            merged = pd.merge(merged, df, on="Date", how="inner")

    # Ordena por Date si es interpretable como fecha, si no, deja tal cual
    try:
        merged["_sort"] = pd.to_datetime(merged["Date"], errors="raise")
        merged = merged.sort_values("_sort").drop(columns=["_sort"])
    except Exception:
        pass

    # Exporta a Excel en la carpeta principal
    out_path = root_folder / "Economic_footprint_merged.xlsx"
    # Usa engine openpyxl explícitamente
    merged.to_excel(out_path, index=False, engine="openpyxl")

    print(f"Archivo generado: {out_path}")
    print(f"Filas: {len(merged)}, Columnas: {len(merged.columns)}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python merge_economic_footprint.py <ruta_carpeta_principal>")
        sys.exit(1)
    main(Path(sys.argv[1]))
