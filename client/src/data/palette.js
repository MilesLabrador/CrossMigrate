import {
  FileSpreadsheet,
  Pencil,
  ArrowLeftRight,
  Columns2,
  Filter as FilterIcon,
  Wand2,
  CopyMinus,
  Shuffle,
  Database,
  DatabaseZap,
  Download,
  Eye,
  TableProperties,
  LayoutList,
  BarChart2,
} from 'lucide-react';

export const PALETTE = [
  {
    group: 'Sources',
    accent: 'text-emerald-400',
    items: [
      { type: 'dataverseInput', label: 'Dataverse Input', icon: DatabaseZap,  desc: 'Fetch rows from Dataverse' },
      { type: 'dataverseView',  label: 'Dataverse View',  icon: LayoutList,   desc: 'Fetch using a saved Power Platform view' },
      { type: 'csvInput',       label: 'CSV Input',       icon: FileSpreadsheet, desc: 'Upload a CSV file' },
      { type: 'manualData',     label: 'Manual Data',     icon: Pencil,          desc: 'Type rows by hand' },
    ],
  },
  {
    group: 'Transforms',
    accent: 'text-slate-300',
    items: [
      { type: 'selectColumns', label: 'Select Columns', icon: Columns2,       desc: 'Keep only chosen columns' },
      { type: 'selectMap',   label: 'Select / Map', icon: ArrowLeftRight, desc: 'Map source → target fields' },
      { type: 'filter',      label: 'Filter',        icon: FilterIcon,     desc: 'Keep rows matching conditions' },
      { type: 'transform',   label: 'Transform',     icon: Wand2,          desc: 'Clean & reformat fields' },
      { type: 'deduplicate',   label: 'Deduplicate',     icon: CopyMinus, desc: 'Remove duplicate rows' },
      { type: 'randomSample', label: 'Random Sample',   icon: Shuffle,   desc: 'Grab N random rows' },
      { type: 'preview',        label: 'Preview',         icon: Eye,             desc: 'Inspect rows — passes through' },
      { type: 'previewColumns', label: 'Preview Columns', icon: TableProperties, desc: 'Show column names & types' },
      { type: 'fieldUsage',     label: 'Field Usage',     icon: BarChart2,       desc: 'Fill rate, unique count & types per field' },
    ],
  },
  {
    group: 'Destinations',
    accent: 'text-rose-400',
    items: [
      { type: 'dataverseOutput', label: 'Dataverse Output', icon: Database, desc: 'Import into Dataverse' },
      { type: 'csvExport',       label: 'CSV Export',       icon: Download, desc: 'Download as CSV' },
    ],
  },
];

export const ALL_PALETTE_ITEMS = PALETTE.flatMap((g) => g.items);
