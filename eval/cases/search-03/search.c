#include <stdio.h>

void bubble_sort(int a[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (a[j] > a[j + 1]) {
                int t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
        }
    }
}

int binary_search(const int a[], int n, int target) {
    for (int i = 0; i < n; i++) {
        if (a[i] == target) return i;
    }
    return -1;
}

int main(void) {
    int a[] = {5, 2, 9, 1, 7};
    int n = sizeof a / sizeof a[0];
    bubble_sort(a, n);
    for (int i = 0; i < n; i++) printf("%d ", a[i]);
    printf("\n");
    printf("7: %d\n", binary_search(a, n, 7));
    printf("4: %d\n", binary_search(a, n, 4));
    return 0;
}
