const NUM_REGISTERS = 16;
const FLAG_REGISTER = 0xF;
const INIT_HERTZ = 60; // starting hertz for timer registers
const HEIGHT = 32; // display resolution height
const WIDTH = 64; // display resolution width
const PROGRAM_START = 0x200;
const FONTS_START = 0x50;
const FONT_LEN = 5; // number of bytes for a font character
const MEMORY_SIZE = 0x1000;
const BEEP_SOUND_FILE = "./audio/beep-06.mp3"
const SPRITE_WIDTH = 8;
const SCALE = 10;
const INTERVAL = Math.floor(1000 / 60);
// const INTERVAL = 500;


const INPUT_MAP = {
  "1": 1, "2": 2, "3": 4, "4": 0xC,
  "q": 4, "w": 5, 'e': 5, 'r': 0xD,
  'a': 7, 's': 8, 'd': 9, 'f': 0xE,
  'z': 0xA, 'x': 0, 'c': 0xB, 'v': 0xF
}

const FONT_SET = [
  0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
  0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
  0x90, 0x90, 0xF0, 0x10, 0x10, // 4
  0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
  0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
  0xF0, 0x10, 0x20, 0x40, 0x40, // 7
  0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
  0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
  0xF0, 0x90, 0xF0, 0x90, 0x90, // A
  0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
  0xF0, 0x80, 0x80, 0x80, 0xF0, // C
  0xE0, 0x90, 0x90, 0x90, 0xE0, // D
  0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
  0xF0, 0x80, 0xF0, 0x80, 0x80  // F
]

const sprite_addr = [];

let keys = new Array(16); // hex keyboard

let keyPressed = null;

function playSound() {
  const audio = new Audio(BEEP_SOUND_FILE);
  audio.play();
}

function rand(max) {
  return Math.floor(Math.random() * max);
}

function waitForKeyPress() {
  return new Promise(function (resolve) {
      function onKeyPress(event) {
        document.removeEventListener("keydown", onKeyPress);
        resolve(event.key);
      }

      document.addEventListener('keydown', onKeyPress);
    }
  );
}

const ON = 0xFFFFFFFF;
const OFF = 0;

class CPU {
  constructor(canvas) {
    /* setup function pointer table */
    this.table = new Array(0xF + 1);
    // opcodes starting with 0
    this.table0 = new Array(0xF);
    this.table8 = new Array(0xF);
    this.tableE = new Array(0xF);
    this.tableF = new Array(0x66);

    let i;
    for (i = 0; i <= 0xE; i++) {
      this.table0[i] = this.op_null;
      this.table8[i] = this.op_null;
      this.tableE[i] = this.op_null;
    }
    this.table0[0x0] = this.op_00e0;
    this.table0[0xE] = this.op_00ee;
    // opcodes starting with 8
    this.table8[0] = this.op_8xy0;
    this.table8[1] = this.op_8xy1;
    this.table8[2] = this.op_8xy2;
    this.table8[3] = this.op_8xy3;
    this.table8[4] = this.op_8xy4;
    this.table8[5] = this.op_8xy5;
    this.table8[6] = this.op_8xy6;
    this.table8[7] = this.op_8xy7;
    this.table8[0xE] = this.op_8xye;
    // opcodes starting with E
    this.tableE[0xe] = this.op_ex9e;
    this.tableE[0x1] = this.op_exa1;
    // opcodes starting with F
    for (i = 0; i <= 0x65; i++) {
      this.tableF[i] = this.op_null;
    }
    this.tableF[0x07] = this.op_fx07;
    this.tableF[0x0A] = this.op_fx0a;
    this.tableF[0x15] = this.op_fx15;
    this.tableF[0x18] = this.op_fx18;
    this.tableF[0x1E] = this.op_fx1e;
    this.tableF[0x29] = this.op_fx29;
    this.tableF[0x33] = this.op_fx33;
    this.tableF[0x55] = this.op_fx55;
    this.tableF[0x65] = this.op_fx65;
    /* set pointers */
    this.table[0] = this.op_table0;
    this.table[1] = this.op_1nnn;
    this.table[2] = this.op_2nnn;
    this.table[3] = this.op_3xnn;
    this.table[4] = this.op_4xnn;
    this.table[5] = this.op_5xy0;
    this.table[6] = this.op_6xnn;
    this.table[7] = this.op_7xnn;
    this.table[8] = this.op_table8;
    this.table[9] = this.op_9xy0;
    this.table[0xA] = this.op_annn;
    this.table[0xB] = this.op_bnnn;
    this.table[0xC] = this.op_cxnn;
    this.table[0xD] = this.op_dxyn;
    this.table[0xE] = this.op_tableE;
    this.table[0xF] = this.op_tableF;
    this.canvas = canvas
    this.ctx = this.canvas.getContext("2d");
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, WIDTH * SCALE, HEIGHT * SCALE);
    this.memory = new Uint8Array(MEMORY_SIZE);
    // load fonts into memory
    for (let i = 0; i < FONT_SET.length; i++) {
      this.memory[FONTS_START + i] = FONT_SET[i];
    }
    this.stack = new Uint16Array(16);

    this.registers = new Uint8Array(NUM_REGISTERS);
    this.I = 0; // address register
    this.sp = 0; // stack pointer
    this.pc = 0; // program counter
    this.delay_timer = INIT_HERTZ;
    this.sound_timer = INIT_HERTZ;
    this.interval = null;
    this.opcode = 0; // store current opcode
    this.display = new Uint32Array(WIDTH * HEIGHT);


  }

  op_table0() {
    this.table0[this.opcode & 0x000F]();
  }

  op_table8() {
    this.table8[this.opcode & 0x000F]();
  }

  op_tableE() {
    this.tableE[this.opcode & 0x000F]();
  }

  op_tableF() {
    this.tableF[this.opcode & 0x00FF]();
  }

  op_null() {
  }

  op_00e0() {
    for (let i = 0; i < this.display.length; i++) {
      this.display[i] = 0;
    }
  }

  op_00ee() {
    this.pc = this.stack[--this.sp];
  }

  op_1nnn() {
    this.pc = this.opcode & 0x0fff; // jmp to address
  }

  op_2nnn() {
    // call subroutine at nnn
    let addr = this.opcode & 0x0FFF;
    this.stack[this.sp] = this.pc; // push return address to stack
    ++this.sp;
    this.pc = addr;
  }

  op_3xnn() {
    let x = (this.opcode & 0x0F00) >> 8;
    let c = this.opcode & 0x0FF;
    if (this.registers[x] === c) {
      this.pc += 2;
    }
  }

  op_4xnn() {
    let x = (this.opcode & 0x0F00) >> 8;
    let c = this.opcode & 0x0FF;
    if (this.registers[x] !== c) {
      this.pc += 2;
    }
  }

  op_5xy0() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    if (this.registers[x] === this.registers[y]) {
      this.pc += 2;
    }
  }

  op_6xnn() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.registers[x] = this.opcode & 0x0FF;
  }

  op_7xnn() {
    let x = (this.opcode & 0x0F00) >> 8;
    let c = this.opcode & 0x0FF;
    this.registers[x] += c;
  }

  op_8xy0() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    this.registers[x] = this.registers[y];
  }

  op_8xy1() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    this.registers[x] |= this.registers[y];
  }

  op_8xy2() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    this.registers[x] &= this.registers[y];
  }

  op_8xy3() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    this.registers[x] ^= this.registers[y];
  }

  op_8xy4() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    let ans = Number(this.registers[x]) + Number(this.registers[y]);
    // check for overflow
    if (ans > 255) {
      this.registers[FLAG_REGISTER] = 1;
    } else {
      this.registers[FLAG_REGISTER] = 0;
    }
    this.registers[x] = ans & 0xFF;
  }

  op_8xy5() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;

    // check for underflow
    if (this.registers[x] > this.registers[y]) {
      this.registers[FLAG_REGISTER] = 1;
    } else {
      this.registers[FLAG_REGISTER] = 0;
    }
    this.registers[x] -= this.registers[y];
  }

  op_8xy6() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.registers[FLAG_REGISTER] = this.registers[x] & 1;
    this.registers[x] >>= 1;
  }

  op_8xy7() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    // check for underflow
    if (this.registers[y] > this.registers[x]) {
      this.registers[FLAG_REGISTER] = 1;
    } else {
      this.registers[FLAG_REGISTER] = 0;
    }
    this.registers[x] = this.registers[y] - this.registers[x];
  }

  op_8xye() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.registers[FLAG_REGISTER] = (this.registers[x] & 0x80) >> 7;
    this.registers[x] <<= 1;
  }

  op_9xy0() {
    let x = (this.opcode & 0x0F00) >> 8;
    let y = (this.opcode & 0x00F0) >> 4;
    if (this.registers[x] !== this.registers[y]) {
      this.pc += 2;
    }

  }

  op_annn() {
    this.I = (this.opcode & 0x0FFF);
  }

  op_bnnn() {
    this.pc = this.registers[0] + (this.opcode & 0x0FFF);
  }

  op_cxnn() {
    let x = (this.opcode & 0x0F00) >> 8;
    let c = this.opcode & 0x0FF;
    this.registers[x] = rand(255) & c;
  }

  op_dxyn() {
    let x = this.registers[(this.opcode & 0x0F00) >> 8];
    let y = this.registers[(this.opcode & 0x00F0) >> 4];
    let height = this.opcode & 0x000F;

    let row, col, byte, pixel;


    this.registers[FLAG_REGISTER] = 0;


    // update pixels
    for (row = 0; row < height; ++row) {
      byte = this.memory[this.I + row]
      for (col = 0; col < SPRITE_WIDTH; ++col) {
        pixel = this.display[(y + row) * WIDTH + (x + col)];
        // sprite pixel is on
        if ((byte & (0x80 >> col)) !== 0) {
          // check for collision
          if (pixel === ON) {
            this.registers[FLAG_REGISTER] = 1;
          }
          this.display[(y + row) * WIDTH + (x + col)] ^= ON;
        }

      }
    }
    // clear screen
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(SCALE, SCALE);

    // draw pixels
    for (let i = 0; i < this.display.length; i++) {
      if (this.display[i] !== 0) {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(i % WIDTH, Math.floor(i / WIDTH), 1, 1);
      }
    }
  }

  op_ex9e() {
    let x = (this.opcode & 0x0F00) >> 8;
    if (this.registers[x] === keyPressed) {
      this.pc += 2;
    }
  }

  op_exa1() {
    let x = (this.opcode & 0x0F00) >> 8;
    if (this.registers[x] !== keyPressed) {
      this.pc += 2;
    }
  }

  op_fx07() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.registers[x] = this.delay_timer;
  }

  op_fx0a() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.registers[x] = INPUT_MAP[keyPressed];
  }

  op_fx15() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.delay_timer = this.registers[x];
  }

  op_fx18() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.sound_timer = this.registers[x];
  }

  op_fx1e() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.I += this.registers[x];
  }

  op_fx29() {
    let x = (this.opcode & 0x0F00) >> 8;
    this.I = FONTS_START + (FONT_LEN * this.registers[x]);
  }

  op_fx33() {
    let x = (this.opcode & 0x0F00) >> 8;
    let val = this.registers[x];
    for (let offset = 2; offset >= 0; offset--) {
      this.memory[this.I + offset] = val % 10;
      val = Math.floor(val / 10);
    }
  }

  op_fx55() {
    let x = (this.opcode & 0x0F00) >> 8;
    for (let i = 0; i <= this.registers[x]; i++) {
      this.memory[this.I + i] = this.registers[i];
    }
  }

  op_fx65() {
    let x = (this.opcode & 0x0F00) >> 8;
    for (let i = 0; i <= this.registers[x]; i++) {
      this.registers[i] = this.memory[this.I + i];
    }

  }

  clear_display() {
    for (let i = 0; i < this.display.length; i++)
      this.display[i] = 0;

    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  load_rom(rom) {
    this.reset()
    this.pc = PROGRAM_START;
    let pos = this.pc;
    for (let i = 0; i < rom.length; i++) {
      this.memory[pos++] = rom[i];
    }
  }

  async load_and_run(rom) {
    return new Promise((resolve) => {
      this.load_rom(rom);
      this.interval = setInterval(async () => {
        await this.cycle()
      }, INTERVAL);

      resolve();
    })


  }


  async cycle2() {
    return new Promise((resolve) => {
      this.opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1];
      // execute
      this.pc += 2;
      console.log(`opcode: ${this.opcode.toString(16).padStart(4, '0')}`);
      try {
        this.table[(this.opcode & 0xF000) >> 12]();
      } catch (err) {
        console.log(`an error occurred: ${err}`);
      }

      if (this.delay_timer > 0) {
        this.delay_timer--;
      }
      if (this.sound_timer > 0) {
        this.sound_timer--;
        if (this.sound_timer === 1) {
          playSound()
        }
      }

      resolve();
    })

  }

  async cycle() {
    return new Promise(async (resolve) => {
      let opcode, addr, x, y, c, ans, msb, lsb, height, key;
      // fetch
      opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1];
      this.opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1];
      // execute
      this.pc += 2;
      // this.table[(this.opcode & 0xF000) >> 12]();


      switch (opcode & 0xF000) {
        case 0x0000:
          switch (opcode & 0x0F00) {
            case 0:
              switch (opcode & 0x000F) {
                case 0xE:
                  this.op_00ee();
                  break
                case 0: // return from subroutine
                  this.op_00e0();
                  break
                default:
                  this.op_null();
                  break;
              }
              break;
            default:
              this.op_null();
              break
          }
          break;
        case 0x1000: // jump to address
          this.op_1nnn();
          break;
        case 0x2000: // call subroutine at address
          this.op_2nnn();
          break;
        case 0x3000: // skip next instruction if Vx = NN
          this.op_3xnn();
          break;
        case 0x4000:  // skip next instruction if Vx != NN
          this.op_4xnn();
          break;
        case 0x5000:  // skip next instruction if Vx == Vy
          this.op_5xy0();
          break;
        case 0x6000:
          this.op_6xnn();
          break;
        case 0x7000:
          this.op_7xnn();
          break;
        case 0x8000:
          switch (opcode & 0x000F) {
            case 0:
              this.op_8xy0();
              break
            case 1:
              this.op_8xy1();
              break;
            case 2:
              this.op_8xy2();
              break
            case 3:
              this.op_8xy3();
              break;
            case 4:
              this.op_8xy4();
              break;
            case 5:
              this.op_8xy5();
              break;
            case 6:
              this.op_8xy6();
              break;
            case 7:
              this.op_8xy7();
              break;
            case 0xE:
              this.op_8xye();
              break;
            default:
              this.op_null();
              break;
          }
          break;
        case 0x9000:
          this.op_9xy0();
          break;
        case 0xA000:
          this.op_annn();
          break;
        case 0xB000:
          this.op_bnnn();
          break;
        case 0xC000:
          this.op_cxnn();
          break;
        case 0xD000: // draw sprite with height n at x, y
          this.op_dxyn();
          break;
        case 0xE000:
          switch (opcode & 0x00FF) {
            case 0x9E: // skip next instruction if key stored in vx is pressed
              this.op_ex9e();
              break;
            case 0xA1: // skip next instruction if key stored in vx is not pressed
              this.op_exa1();
              break;
            default:
              this.op_null();
              break
          }
          break
        case 0xF000:
          switch (opcode & 0x00FF) {
            case  0x07:
              this.op_fx07();
              break;
            case 0x0A: // await key press
              this.op_fx0a();
              break;
            case 0x15:
              this.op_fx15();
              break;
            case 0x18:
              this.op_fx18();
              break;
            case 0x1E:
              this.op_fx1e();
              break;
            case 0x29:
              this.op_fx29();
              break;
            case 0x33: // store binary-coded decimal representation of Vx
              this.op_fx33();
              break;
            case 0x55: // dump v0 to vx in memory starting from I
              this.op_fx55();
              break;
            case 0x65:// load memory starting from I into v0 to vx
              this.op_fx65();
              break;
          }
          break;
        default:
          this.op_null();
          break;
      }
      if (this.delay_timer > 0) {
        this.delay_timer--;
      }
      if (this.sound_timer > 0) {
        this.sound_timer--;
        if (this.sound_timer === 1) {
          playSound()
        }
      }
      resolve();
    })

  }


  reset() {


    this.clear_display();
    if (this.interval !== null) {
      clearInterval(this.interval);
    }
    // this.memory = new Uint8Array(MEMORY_SIZE);
    for (let i = PROGRAM_START; i <= MEMORY_SIZE; i++) {
      this.memory[i] = 0;
    }
    this.stack = new Uint16Array(16);

    this.registers = new Uint8Array(NUM_REGISTERS);
    this.I = 0; // address register
    this.sp = 0; // stack pointer
    this.pc = PROGRAM_START; // program counter
    this.delay_timer = INIT_HERTZ;
    this.sound_timer = INIT_HERTZ;
  }
}


document.addEventListener("DOMContentLoaded", async function () {

  window.addEventListener("keydown", function (event) {
    keyPressed = INPUT_MAP[event.key];
  })
  window.addEventListener("keyup", function (event) {
    keyPressed = null;
  })
  const fileInput = document.getElementById("romFileInput");
  const resetBtn = document.getElementById("resetBtn");
  const canvas = document.getElementById("display") || null;
  let cpu = null;

  resetBtn.addEventListener("click", function () {
    if (cpu) {
      cpu.clear_display();
      clearInterval(cpu.interval);
    }
    cpu = new CPU(canvas);
  })

  fileInput.addEventListener("input", function (event) {
    // console.log(fileInput.value);
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async function (e) {
        if (cpu) {
          cpu.clear_display();
          clearInterval(cpu.interval);
        }
        cpu = new CPU(canvas);
        const bytes = new Uint8Array(e.target.result);
        await cpu.load_and_run(bytes)
      }
      reader.readAsArrayBuffer(file);
    }
  })


})
