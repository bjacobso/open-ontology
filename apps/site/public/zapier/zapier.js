// Static design examples. These controls do not run a model checker or call Zapier.
const content = document.querySelector("#review-content");
const options = document.querySelector(".zp-review-options");

if (content && options) {
  const channelExample = content.innerHTML;
  const fieldExample = `<div class="zp-diff">
    <p class="zp-diff-context">; sales/Opportunity.forma</p>
    <p class="zp-diff-remove">− (field AccountId (ref Account))</p>
    <p class="zp-diff-add">+ (field CustomerAccountId (ref Account))</p>
    <p class="zp-diff-context">; automation still refers to opportunity.AccountId</p>
  </div>
  <div class="zp-review-result">
    <span class="zp-result-icon zp-result-icon--error" aria-hidden="true">→</span>
    <div><strong>A downstream reference needs attention.</strong>
    <p>A future cross-project checker could report that <code>opportunity.AccountId</code> no longer exists in the imported sales model, pointing to the customer lookup that uses it.</p></div>
  </div>`;

  for (const button of options.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      for (const option of options.querySelectorAll("button")) {
        option.setAttribute("aria-pressed", String(option === button));
      }
      content.innerHTML = button.dataset.example === "field" ? fieldExample : channelExample;
    });
  }
  options.hidden = false;
}
