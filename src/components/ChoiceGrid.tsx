import type { StyleDef } from '../game/config.ts'

export interface ChoiceGridProps {
  choices: readonly StyleDef[]
  /** 已选中的舞种 id，未作答为 null */
  pickedId: string | null
  answerId: string
  onPick: (styleId: string) => void
}

const LETTERS = 'ABCDEFGH'

export function ChoiceGrid({ choices, pickedId, answerId, onPick }: ChoiceGridProps) {
  const revealed = pickedId !== null

  return (
    <div className="choices" role="group" aria-label="选择舞种">
      {choices.map((choice, index) => {
        const isAnswer = choice.id === answerId
        const isPicked = choice.id === pickedId
        const state = !revealed ? '' : isAnswer ? ' choices__item--correct' : isPicked ? ' choices__item--wrong' : ' choices__item--dim'

        return (
          <button
            className={'choices__item' + state}
            key={choice.id}
            type="button"
            disabled={revealed}
            aria-pressed={isPicked}
            onClick={() => onPick(choice.id)}
          >
            <span className="choices__key">{LETTERS[index]}</span>
            <span className="choices__name">{choice.name}</span>
            {revealed && isAnswer && <span className="choices__tag">答案</span>}
          </button>
        )
      })}
    </div>
  )
}
