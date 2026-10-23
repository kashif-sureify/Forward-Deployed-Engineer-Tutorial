export class JudgeResult {
  constructor({ relevance, correctness, faithfulness, helpfulness, hallucinationFree, reason }) {
    Object.assign(this, { relevance, correctness, faithfulness, helpfulness, hallucinationFree, reason });
  }
}