export interface ParityReport {
  scenarioId: string;
  passed: boolean;
  failures: string[];
  traceSummary: {
    actions: string[];
    states: string[];
    readDocCount: number;
    evidenceItemCount: number;
    invalidActionCount: number;
    focusedRootTitle?: string;
    candidateOrder?: string[];
    gateConsistencyOk: boolean;
  };
}
