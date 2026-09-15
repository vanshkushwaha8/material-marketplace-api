const QUESTION_BANK_VERSION = 'v1-2026-01';

const PASS_THRESHOLD = 75;

const QUESTIONS = [
  {
    questionId: 'q1',
    text: 'What is the main risk when investing through a crowdfunding platform?',
    options: [
      'There is no risk; returns are guaranteed by the platform',
      'You may lose part or all of the money you invest',
      'The platform insures your capital up to €100,000',
      'Losses are always reimbursed after 12 months',
    ],
    correctOptionIndex: 1,
  },
  {
    questionId: 'q2',
    text: 'As a non-sophisticated investor, what protection applies after you commit to an offer?',
    options: [
      'A 4-day reflection period to withdraw without penalty',
      'No protection applies',
      'A 30-day money-back guarantee on returns',
      'A lifetime right to cancel the investment',
    ],
    correctOptionIndex: 0,
  },
  {
    questionId: 'q3',
    text: 'Crowdfunding investments are generally considered:',
    options: [
      'Fully liquid — you can sell them at any time',
      'Illiquid — you may not be able to sell them easily or quickly',
      'Bank deposits with a fixed interest rate',
      'Covered by a national deposit-guarantee scheme',
    ],
    correctOptionIndex: 1,
  },
  {
    questionId: 'q4',
    text: 'EU rules advise that you should generally not invest more than what share of your net worth in crowdfunding?',
    options: ['1%', '10%', '50%', '100%'],
    correctOptionIndex: 1,
  },
  {
    questionId: 'q5',
    text: 'If a project you invested in fails, what is the most likely outcome?',
    options: [
      'The platform automatically refunds your capital',
      'You could lose the entirety of the money invested in that project',
      'You receive your capital plus interest',
      'The loss is capped at 10% of your investment',
    ],
    correctOptionIndex: 1,
  },
];

// Public view (no answers) for the frontend.
const getPublicQuestions = () =>
  QUESTIONS.map((q) => ({
    questionId: q.questionId,
    text: q.text,
    options: q.options,
  }));

module.exports = {
  QUESTION_BANK_VERSION,
  PASS_THRESHOLD,
  QUESTIONS,
  getPublicQuestions,
};
