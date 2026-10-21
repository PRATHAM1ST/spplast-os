export interface Trace {
  truncated: boolean;
  lots: {
    id: string;
    code: string;
    material: string;
    owner: string | null;
    qc: string;
    balance: string;
  }[];
  edges: {
    parent: string;
    child: string;
    document: string;
    code: string;
    stage: string;
    date: string;
    status: string;
    input_kg: string;
    output_kg: string;
    operator: string;
    machine: string | null;
    recipe: string | null;
    revision: number | null;
  }[];
  dispatches: {
    id: string;
    code: string;
    date: string;
    status: string;
    lot_id: string;
    quantity: string;
    customer: string;
  }[];
}
