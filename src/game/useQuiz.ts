import { useCallback, useMemo, useReducer, useRef } from 'react'
import type { QuizConfig, StyleDef } from './config.ts'
import type { PlayableClip } from './source.ts'
import { buildQuestion, createClipDeck, type Question } from './quiz.ts'

export type Phase = 'playing' | 'revealed' | 'done'

export interface AnswerRecord {
  clip: PlayableClip
  /** 答对时是选中的那个舞种，答错时是选错的舞种 */
  picked: StyleDef
  correct: StyleDef
  isCorrect: boolean
}

export interface QuizState {
  phase: Phase
  question: Question
  /** 1 起的题号 */
  questionNo: number
  correctCount: number
  streak: number
  bestStreak: number
  /** 本题选中的舞种 id，未作答为 null */
  pickedId: string | null
  history: AnswerRecord[]
}

type Action =
  | { type: 'answer'; styleId: string }
  | { type: 'advance'; question: Question }
  | { type: 'finish' }
  | { type: 'restart'; question: Question }

function freshState(question: Question): QuizState {
  return {
    phase: 'playing',
    question,
    questionNo: 1,
    correctCount: 0,
    streak: 0,
    bestStreak: 0,
    pickedId: null,
    history: [],
  }
}

function reducer(state: QuizState, action: Action): QuizState {
  switch (action.type) {
    case 'answer': {
      if (state.phase !== 'playing' || state.pickedId !== null) return state
      const picked = state.question.choices.find((choice) => choice.id === action.styleId)
      if (!picked) return state
      const isCorrect = picked.id === state.question.answer.id
      const streak = isCorrect ? state.streak + 1 : 0
      return {
        ...state,
        phase: 'revealed',
        pickedId: picked.id,
        correctCount: state.correctCount + (isCorrect ? 1 : 0),
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        history: [...state.history, { clip: state.question.clip, picked, correct: state.question.answer, isCorrect }],
      }
    }
    case 'advance':
      return { ...state, phase: 'playing', question: action.question, questionNo: state.questionNo + 1, pickedId: null }
    case 'finish':
      return { ...state, phase: 'done' }
    case 'restart':
      return freshState(action.question)
  }
}

export interface Quiz {
  state: QuizState
  total: number
  /** 已作答的题数 */
  answered: number
  answer: (styleId: string) => void
  /** 进入下一题（只在已揭晓时有效） */
  next: () => void
  /** 直接跳过当前题、不计分（视频加载失败时用） */
  skip: () => void
  restart: () => void
}

export function useQuiz(config: QuizConfig, clips: readonly PlayableClip[]): Quiz {
  const { choiceCount, questionsPerRound } = config.settings
  const nonce = useRef(0)
  const deck = useRef(createClipDeck(clips))

  const makeQuestion = useCallback(
    (): Question => {
      nonce.current += 1
      const clip = deck.current()
      return buildQuestion(clip, config.styles, choiceCount, String(nonce.current))
    },
    [choiceCount, config.styles],
  )

  const [state, dispatch] = useReducer(reducer, undefined, () => freshState(makeQuestion()))

  const next = useCallback(() => {
    if (state.phase !== 'revealed') return
    if (state.questionNo >= questionsPerRound) dispatch({ type: 'finish' })
    else dispatch({ type: 'advance', question: makeQuestion() })
  }, [state.phase, state.questionNo, questionsPerRound, makeQuestion])

  const skip = useCallback(() => {
    if (state.phase === 'done') return
    if (state.questionNo >= questionsPerRound) dispatch({ type: 'finish' })
    else dispatch({ type: 'advance', question: makeQuestion() })
  }, [state.phase, state.questionNo, questionsPerRound, makeQuestion])

  const restart = useCallback(() => {
    deck.current = createClipDeck(clips)
    dispatch({ type: 'restart', question: makeQuestion() })
  }, [clips, makeQuestion])

  return useMemo(
    () => ({
      state,
      total: questionsPerRound,
      answered: state.history.length,
      answer: (styleId: string) => dispatch({ type: 'answer', styleId }),
      next,
      skip,
      restart,
    }),
    [state, questionsPerRound, next, skip, restart],
  )
}
