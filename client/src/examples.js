export const examples = [
  {
    name: "Arithmetic + If",
    code: `#include <stdio.h>

int main() {
  int x = 12;
  int y = 4;
  int z = x + y * 2;

  if (z > 18) {
    printf("large");
  } else {
    printf("small");
  }

  return z;
}`
  },
  {
    name: "Switch Statement",
    code: `#include <stdio.h>

int main() {
  int day = 4;

  switch (day) {
    case 1:
      printf("Sunday");
      break;
    case 4:
      printf("Wednesday");
      break;
    default:
      printf("Other");
  }

  return 0;
}`
  },
  {
    name: "Semantic Errors",
    code: `int main() {
  int total = 10;
  int total = 20;
  count = total + 1;
  char letter = "abc";
  return total;
}`
  }
];

export const defaultCode = examples[0].code;
