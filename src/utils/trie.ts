/**
 * Cấu trúc một nút (Node) trong Cây Tiền Tố (Trie)
 */
export class TrieNode {
    // Lưu các chữ cái con nối tiếp chữ cái hiện tại
    children: Map<string, TrieNode>;
    
    // Đánh dấu đây có phải là điểm kết thúc của một từ hoàn chỉnh không
    isEndOfWord: boolean;
    
    // Tên hashtag đầy đủ (ví dụ: "reactjs")
    tagName: string;
    
    // Số lượng bài viết đang dùng tag này (dùng để ưu tiên xếp tag hot lên đầu)
    postCount: number;

    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.tagName = "";
        this.postCount = 0;
    }
}

export type TagSuggestion = {
    name: string;
    postCount: number;
};

/*
 * Thuật toán Cây Tiền Tố (Trie - Prefix Tree)
 */
export class Trie {
    private root: TrieNode; /* Trong cái Cây Trie này, tôi sẽ luôn có một vị trí đặc biệt gọi là root (Gốc cây) */

    constructor() { /* hành động khởi tạo */
        this.root = new TrieNode();
    }

    /**
     * Chuẩn hóa từ khóa: chuyển về chữ thường, xóa khoảng trắng và bỏ dấu # ở đầu nếu có
     */
    private normalize(text: string): string {
        return text.trim().toLowerCase().replace(/^#+/, "");
    }

    /**
     * Thêm một hashtag vào Cây Trie
     */
    public insert(tag: string, postCount: number = 0): void {
        const cleanTag = this.normalize(tag);
        if (!cleanTag) return;

        let currentNode = this.root; /* bắt đầu từ node gốc */

        for (const char of cleanTag) {
            // chưa có thì tạo mới 1 nhánh con
            if (!currentNode.children.has(char)) {
                currentNode.children.set(char, new TrieNode()); /*new TrieNode() chạy trước: Nó tạo ra đối tượng nút mới trên RAM trước. Hàm .set(char, ...) chạy sau: Nó lấy nút vừa tạo gắn vào nhánh children của nút cũ */
            }
            // Đi tiếp vào nhánh con
            currentNode = currentNode.children.get(char)!; /*đây là vị trí con trỏ hiện tại và Chắc chắn không bị null hay undefined */
        }

        // Đánh dấu nút này là kết thúc của một hashtag
        currentNode.isEndOfWord = true;
        currentNode.tagName = cleanTag;
        currentNode.postCount = postCount;
    }

    /**
     * Tìm kiếm tất cả hashtag bắt đầu bằng tiền tố (prefix)
     * Ví dụ: gõ "re" -> gợi ý "react", "reactjs", "recruitment"...
     * @param prefix Tiền tố người dùng đang gõ
     * @param limit Số lượng gợi ý tối đa muốn lấy (mặc định: 5)
     */
    public searchPrefix(prefix: string, limit: number = 5): TagSuggestion[] {
        const cleanPrefix = this.normalize(prefix);
        if (!cleanPrefix) return [];

        let currentNode = this.root;

        // 1. Duyệt theo từng chữ cái của tiền tố để tìm đến nút gốc của tiền tố đó
        for (const char of cleanPrefix) {
            if (!currentNode.children.has(char)) {
                // Tiền tố này chưa từng xuất hiện trong cây Trie
                return []; /* Dừng lại ngay và trả về rỗng (vì không tìm thấy khác với cây tiền tố trên là tạo mới) */
            }
            currentNode = currentNode.children.get(char)!; 
            /* 
                Trường hợp 1: Đứt gánh giữa đường (DỪNG NGAY)
                    Nếu chỉ cần 1 chữ cái bất kỳ không có trong cây 
                    → Lập tức dừng lại ngay và trả về rỗng: return [].
                    Ví dụ: Người dùng gõ "xyz". Ngay chữ 'x' đầu tiên tìm không thấy 
                    → dừng luôn, không thèm tìm 'y', 'z' nữa.
                Trường hợp 2: Tìm thấy trọn vẹn (DUYỆT HẾT TIỀN TỐ)
                    Nếu tất cả các chữ cái người dùng gõ đều có trong cây:
                    Vòng lặp chạy trọn vẹn đến chữ cái cuối cùng
                    Khi vòng for kết thúc, con trỏ currentNode đang đứng đúng tại điểm kết thúc của tiền tố
                    Ví dụ: Người dùng gõ "re". Đi qua 'r' 
                    → đến 'e'. Kết thúc vòng for, máy tính đang đứng ở nút 'e' để chuẩn bị gom các từ con bên dưới (react, reactjs...)
            */
        }

        // 2. Thu thập tất cả các từ con mọc ra từ nút hiện tại (dùng thuật toán DFS - Duyệt theo chiều sâu)
        const results: TagSuggestion[] = [];
        this.collectAllWords(currentNode, results);

        // 3. Sắp xếp kết quả: Ưu tiên tag có nhiều bài viết nhất (postCount) lên đầu
        results.sort((a, b) => b.postCount - a.postCount);

        // 4. Cắt lấy tối đa theo limit (ví dụ: top 5)
        return results.slice(0, limit);
    }

    /*
     * Hàm đệ quy duyệt tất cả các nhánh con từ nhánh chính đã dừng để nhặt ra các từ hoàn chỉnh
     */
    private collectAllWords(node: TrieNode, results: TagSuggestion[]): void { 
        if (node.isEndOfWord) { /* kiểm tra đây có phải là điểm đánh dấu không nếu đúng thì đây là 1 tag hoàn chỉnh rồi */
            results.push({
                name: node.tagName,
                postCount: node.postCount,
            });
        }

        // Duyệt qua tất cả các chữ cái con nối tiếp
        for (const childNode of node.children.values()) { /* kiểm tra bên dưới node hiện tại có node con nao nữa không  */
            this.collectAllWords(childNode, results);
        }
    }

    /*
     * Kiểm tra một tag có tồn tại hoàn chỉnh trong cây không
     */
    // public has(tag: string): boolean {
    //     const cleanTag = this.normalize(tag);
    //     if (!cleanTag) return false;

    //     let currentNode = this.root;
    //     for (const char of cleanTag) {
    //         if (!currentNode.children.has(char)) {
    //             return false;
    //         }
    //         currentNode = currentNode.children.get(char)!;
    //     }

    //     return currentNode.isEndOfWord;
    // }
}

// Xuất ra một instance duy nhất (Singleton) để dùng chung toàn bộ Backend
export const tagTrie = new Trie();