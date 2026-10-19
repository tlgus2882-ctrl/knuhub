public class IntStack {
    private final int[] items;
    private int size = 0;

    public IntStack(int capacity) {
        items = new int[capacity];
    }

    public void push(int value) {
        if (size == items.length) {
            throw new IllegalStateException("스택이 가득 찼습니다");
        }
        items[size++] = value;
    }

    public int pop() {
        if (size == 0) {
            throw new IllegalStateException("스택이 비었습니다");
        }
        return items[--size];
    }

    public boolean isEmpty() {
        return size == 0;
    }
}
