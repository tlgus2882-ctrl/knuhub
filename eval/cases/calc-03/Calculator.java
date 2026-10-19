public class Calculator {
    public int add(int a, int b) { return a + b; }
    public int sub(int a, int b) { return a - b; }
    public int mul(int a, int b) { return a * b; }

    public int div(int a, int b) {
        return a / b;
    }

    public static void main(String[] args) {
        Calculator c = new Calculator();
        System.out.println(c.add(6, 3));
        System.out.println(c.sub(6, 3));
        System.out.println(c.mul(6, 3));
        System.out.println(c.div(6, 3));
    }
}
