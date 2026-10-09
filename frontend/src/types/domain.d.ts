export interface ProfessorAuth {
  idProfessor?: number | string | null;
  role?: string;
  tipo?: string;
  token?: string;
  username?: string;
}

export interface CaseDraft {
  draftKey?: string;
  caseInfo: {
    title: string;
    discipline: string;
    difficulty: string;
    healthArea?: string;
    specialty: string;
    style?: string;
  };
  patient: {
    age: string | number;
    profession: string;
    weight: string;
    height: string;
    name?: string;
    biologicalSex?: string;
    maritalStatus?: string;
    allowAiCompletion?: boolean;
    otherInfo?: string;
  };
  clinical: {
    pedagogicalGoal: string;
    centralHypothesis: string;
    symptoms: string;
    comorbidities: string;
    clinicalContext: string;
    clinicalExam?: string;
    includeClinicalExams?: boolean;
  };
}
