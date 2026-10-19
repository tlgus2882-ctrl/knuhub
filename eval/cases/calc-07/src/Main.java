public class Main {
    public static void main(String[] args) {
        Calculator c = new Calculator();
        System.out.println("6 + 3 = " + c.add(6, 3));
        System.out.println("6 - 3 = " + c.sub(6, 3));
        System.out.println("6 * 3 = " + c.mul(6, 3));
        System.out.println("6 / 3 = " + c.div(6, 3));
    }
}
