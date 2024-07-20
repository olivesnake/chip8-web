const NUM_REGISTERS = 16;
const FLAG_REGISTER = 0xF;
const INIT_HERTZ = 60; // starting hertz for timer registers
const HEIGHT = 32; // display resolution height
const WIDTH = 64; // display resolution width
const PROGRAM_START = 0x200;
const MEMORY_LOCATIONS = 0x1000;
const BEEP_SOUND_FILE = "./audio/beep-06.mp3"
const SPRITE_WIDTH = 8;

const INPUT_MAP = {
  "1": 1, "2": 2, "3": 4, "4": 0xC,
  "q": 4, "w": 5, 'e': 5, 'r': 0xD,
  'a': 7, 's': 8, 'd': 9, 'f': 0xE,
  'z': 0xA, 'x': 0, 'c': 0xB, 'v': 0xF
}

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

class CPU {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = this.canvas.getContext("2d");
    this.clear_display()
    this.memory = new Uint8Array(MEMORY_LOCATIONS);
    this.stack = new Uint16Array(16);

    this.registers = new Uint8Array(NUM_REGISTERS);
    this.I = 0; // address register
    this.sp = 0; // stack pointer
    this.pc = 0; // program counter
    this.delay_timer = INIT_HERTZ;
    this.sound_timer = INIT_HERTZ;
    this.interval = null;

  }

  clear_display() {
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
      this.load_rom(rom)
      this.interval = setInterval(async () => {
        await this.cycle()
      }, 10);
      resolve();
    })


  }

  async cycle() {
    return new Promise(async (resolve) => {
      let opcode, addr, x, y, c, ans, msb, lsb, n, key;
      opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1];
      console.log(opcode)
      switch (opcode & 0xF000) {
        case 0x0000:
          switch (opcode & 0x0F00) {
            case 0:
              switch (opcode & 0x000F) {
                case 0xE:
                  this.clear_display()
                  this.pc += 2;
                  break
                case 0: // return from subroutine
                  addr = this.stack[this.sp]; // pop from stack
                  this.sp--;
                  this.pc = addr;
                  break
                default:
                  console.log(`unrecognized opcode`)
                  alert("unrecognized opcode")
                  break;
              }
              break;
            default:
              console.log(`unrecognized opcode: ${opcode}`);
              alert("unrecognized opcode")
              break
          }
          break;
        case 0x1000: // jump to address
          addr = opcode & 0x0FFF;
          this.pc = addr;
          break;
        case 0x2000: // call subroutine at address
          addr = opcode & 0x0FFF;
          this.stack[this.sp++] = this.pc + 2; // push return address to stack
          this.pc = addr;
          break;
        case 0x3000: // skip next instruction if Vx = NN
          x = (opcode & 0x0F00) >> 8;
          c = opcode & 0x0FF;
          this.pc += (this.registers[x] === c) ? 4 : 2;
          break;
        case 0x4000:  // skip next instruction if Vx != NN
          x = (opcode & 0x0F00) >> 8;
          c = opcode & 0x0FF;
          this.pc += (this.registers[x] !== c) ? 4 : 2;
          break;
        case 0x5000:  // skip next instruction if Vx == Vy
          x = (opcode & 0x0F00) >> 8;
          y = (opcode & 0x00F0) >> 4;
          this.pc += (this.registers[x] === this.registers[y]) ? 4 : 2;
          break;
        case 0x6000:
          x = (opcode & 0x0F00) >> 8;
          c = opcode & 0x0FF;
          this.registers[x] = c;
          this.pc += 2;
          break;
        case 0x7000:
          x = (opcode & 0x0F00) >> 8;
          c = opcode & 0x0FF;
          this.registers[x] += c;
          this.pc += 2;
          break;
        case 0x8000:
          switch (opcode & 0x000F) {
            case 0:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              this.registers[x] = this.registers[y];
              this.pc += 2;
              break
            case 1:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              this.registers[x] |= this.registers[y];
              this.pc += 2;
              break;
            case 2:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              this.registers[x] &= this.registers[y];
              this.pc += 2;
              break
            case 3:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              this.registers[x] ^= this.registers[y];
              this.pc += 2;
              break;
            case 4:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              ans = Number(this.registers[x]) + Number(this.registers[y]);
              this.registers[x] += this.registers[y];
              // check for overflow
              if ((ans & 0xFF) === ans) {
                this.registers[FLAG_REGISTER] = 0;
              } else {
                this.registers[FLAG_REGISTER] = 1;
              }
              this.pc += 2;
              break;
            case 5:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              this.registers[x] -= this.registers[y];
              // check for underflow
              if (this.registers[x] >= this.registers[y]) {
                this.registers[FLAG_REGISTER] = 1;
              } else {
                this.registers[FLAG_REGISTER] = 0;
              }
              this.pc += 2;
              break;
            case 6:
              x = (opcode & 0x0F00) >> 8;
              lsb = this.registers[x] & 1;
              this.registers[x] >>= 1;
              this.registers[FLAG_REGISTER] = lsb;
              this.pc += 2;
              break;
            case 7:
              x = (opcode & 0x0F00) >> 8;
              y = (opcode & 0x00F0) >> 4;
              this.registers[x] = this.registers[y] - this.registers[x];
              // check for underflow
              if (this.registers[y] >= this.registers[x]) {
                this.registers[FLAG_REGISTER] = 1;
              } else {
                this.registers[FLAG_REGISTER] = 0;
              }
              this.pc += 2;
              break;
            case 0xE:
              x = (opcode & 0x0F00) >> 8;
              msb = this.registers[x] & 0x80;
              this.registers[x] <<= 1;
              this.registers[FLAG_REGISTER] = msb;
              this.pc += 2;
              break;
            default:
              console.log("unrecognized opcode");
              break;
          }
          break;
        case 0x9000:
          x = (opcode & 0x0F00) >> 8;
          y = (opcode & 0x00F0) >> 4;
          this.pc += (this.registers[x] !== this.registers[y]) ? 4 : 2;
          break;
        case 0xA000:
          addr = opcode & 0x0FFF;
          this.I = addr;
          this.pc += 2;
          break;
        case 0xB000:
          addr = opcode & 0x0FFF;
          this.pc = this.registers[0] + addr;
          break;
        case 0xC000:
          x = (opcode & 0x0F00) >> 8;
          c = opcode & 0x0FF;
          this.registers[x] = rand(255) & c;
          this.pc += 2;
          break;
        case 0xD000: // draw sprite with height n at x, y
          x = (opcode & 0x0F00) >> 8;
          y = (opcode & 0x00F0) >> 4;
          n = opcode & 0x000F;
          this.ctx.fillStyle = 'white'
          this.ctx.fillRect(
            this.registers[x],
            this.registers[y],
            SPRITE_WIDTH,
            n
          )
          this.pc += 2;
          break;
        case 0xE000:
          switch (opcode & 0x00FF) {
            case 0x9E: // skip next instruction if key stored in vx is pressed
              x = (opcode & 0x0F00) >> 8;
              this.pc += (this.registers[x] === keyPressed) ? 4 : 2;
              break;
            case 0xA1: // skip next instruction if key stored in vx is not pressed
              x = (opcode & 0x0F00) >> 8;
              this.pc += (this.registers[x] !== keyPressed) ? 4 : 2;
              break;
            default:
              console.log("unrecognized opcode");
              alert("unrecognized opcode")
              break
          }
          break
        case 0xF000:
          switch (opcode & 0x00FF) {
            case  0x07:
              x = (opcode & 0x0F00) >> 8;
              this.registers[x] = this.delay_timer;
              this.pc += 2;
              break;
            case 0x0A: // await key press
              x = (opcode & 0x0F00) >> 8;
              key = await waitForKeyPress();
              this.registers[x] = INPUT_MAP[key];
              this.pc += 2;
              break;
            case 0x15:
              x = (opcode & 0x0F00) >> 8;
              this.delay_timer = this.registers[x];
              this.pc += 2;
              break;
            case 0x18:
              x = (opcode & 0x0F00) >> 8;
              this.sound_timer = this.registers[x];
              this.pc += 2;
              break;
            case 0x1E:
              x = (opcode & 0x0F00) >> 8;
              this.I += this.registers[x];
              this.pc += 2;
              break;
            case 0x29:
              x = (opcode & 0x0F00) >> 8;
              this.I = sprite_addr[this.registers[x]];
              this.pc += 2;
              break;
            case 0x33: // store binary-coded decimal representation of Vx
              x = (opcode & 0x0F00) >> 8;
              this.I = Math.floor(x / 100); // set 100s place
              this.I++;
              this.I = Math.floor((x % 100) / 10) // set 10s place
              this.I++;
              this.I = x % 10; // set one's place
              this.pc += 2;
              break;
            case 0x55: // dump v0 to vx in memory starting from I
              x = (opcode & 0x0F00) >> 8;
              addr = this.I;
              for (let i = 0; i <= x; i++) {
                this.memory[addr++] = this.registers[i];
              }
              this.pc += 2;
              break;
            case 0x65:// load memory starting from I into v0 to vx
              x = (opcode & 0x0F00) >> 8;
              addr = this.I;
              for (let i = 0; i <= x; i++) {
                this.registers[i] = this.memory[addr++];
              }
              this.pc += 2;
              break;
          }
          break;
        default:
          console.log(`unrecognized opcode: ${opcode}`)
          alert("unrecognized opcode")
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
    this.memory = new Uint8Array(MEMORY_LOCATIONS);
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
    console.log(keyPressed)
  })
  const fileInput = document.getElementById("romFileInput");
  const resetBtn = document.getElementById("resetBtn");
  const canvas = document.getElementById("display") || null;
  const cpu = new CPU(canvas);

  resetBtn.addEventListener("click", function () {
    cpu.reset();
  })

  fileInput.addEventListener("input", function (event) {
    // console.log(fileInput.value);
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async function (e) {
        const bytes = new Uint8Array(e.target.result);
        await cpu.load_and_run(bytes)
      }
      reader.readAsArrayBuffer(file);
    }
  })


})
