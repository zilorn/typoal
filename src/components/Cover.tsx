import type { Cover as CoverType } from "~/lib/types";
import Icon from "./Icon";

export default function Cover(props: { kind: CoverType; large?: boolean }) {
  return (
    <div
      class={`article-cover cover-${props.kind} ${props.large ? "cover-large" : ""}`}
      aria-hidden="true"
    >
      <div class="cover-grain" />
      <div class="paper-art">
        <div class="paper-sheet">
          <span class="paper-kicker">NOTES TO SELF</span>
          <span class="paper-title">
            每一页，
            <br />
            都是开始。
          </span>
          <div class="paper-line" />
          <span class="paper-caption">a little space for thoughts.</span>
        </div>
        <span class="paper-asterisk">✳</span>
        <span class="paper-number">01 — ∞</span>
      </div>
      <div class="code-art">
        <span class="code-kicker">MAKE SOMETHING GOOD.</span>
        <span class="code-brackets">{`{ }`}</span>
        <span class="code-line">
          <i /> a small, useful thing <i />
        </span>
      </div>
      <div class="nature-art">
        <div class="nature-sun" />
        <div class="hill hill-back" />
        <div class="hill hill-front" />
        <span class="nature-caption">TAKE THE LONG WAY HOME</span>
        <div class="nature-leaf">
          <Icon name="leaf" size={55} />
        </div>
      </div>
      <div class="sunset-art">
        <span class="sunset-caption">
          THE ART OF
          <br />
          SLOW LIVING.
        </span>
        <div class="sunset-orb" />
        <div class="sunset-line" />
        <span class="sunset-small">留一点时间，给喜欢的事。</span>
      </div>
    </div>
  );
}
