#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

typedef struct {
    Node *head;
} List;

static Node *new_node(int value) {
    Node *node = malloc(sizeof(Node));
    node->value = value;
    node->next = NULL;
    return node;
}

void push_front(List *list, int value) {
    Node *node = new_node(value);
    node->next = list->head;
    list->head = node;
}

void push_back(List *list, int value) {
    Node *node = new_node(value);
    if (list->head == NULL) {
        list->head = node;
        return;
    }
    Node *cur = list->head;
    while (cur->next != NULL) cur = cur->next;
    cur->next = node;
}

void remove_value(List *list, int value) {
    Node **link = &list->head;
    while (*link != NULL) {
        if ((*link)->value == value) {
            Node *gone = *link;
            *link = gone->next;
            free(gone);
            return;
        }
        link = &(*link)->next;
    }
}

void free_list(List *list) {
    free(list->head);
    list->head = NULL;
}

int main(void) {
    List list = {NULL};
    push_front(&list, 2);
    push_front(&list, 1);
    push_back(&list, 3);
    remove_value(&list, 2);
    remove_value(&list, 42);
    for (Node *cur = list.head; cur != NULL; cur = cur->next) printf("%d ", cur->value);
    printf("\n");
    free_list(&list);
    return 0;
}
