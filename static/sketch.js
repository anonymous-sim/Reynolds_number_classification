let neurons = [];
let connections = [];
let selectedNeuron = null;
let inputValues = [1000, 0.5, 0.01, 0.001];
let targetInputValues = [...inputValues];
let inputLabels = ['Density', 'Velocity', 'Diameter', 'Viscosity'];
let baseInputColors = ['#FF5555', '#5555FF', '#55FF55', '#FFFF55'];
let darkColors = ['#CC0000', '#0000CC', '#00CC00', '#CCCC00'];
let lightColors = ['#FF9999', '#9999FF', '#99FF99', '#FFFF99'];
let outputColors = ['#00CED1', '#FFA500', '#FF4500']; // Cyan for Laminar, Orange for Transitional, Red for Turbulent
let outputDarkColors = ['#008B8B', '#CC7000', '#CC2500']; // Darker shades for predicted regime
let outputLightColors = ['#66E0E0', '#FFC080', '#FF7040']; // Lighter shades for non-predicted regimes
let inputColors = [...baseInputColors];
let shouldDraw = true;
let transitionSteps = 10;
let currentStep = 0;
let pixelGridSize = 13;
let lastDrawTime = 0;
let drawInterval = 100;
let pixelGridCache = {};
let lastInputHash = '';

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function setup() {
    try {
        let container = document.getElementById('canvas-container');
        if (!container) {
            console.error("Canvas container not found!");
            return;
        }
        let containerWidth = container.offsetWidth;
        let containerHeight = container.offsetHeight;
        if (containerWidth <= 0 || containerHeight <= 0) {
            console.error(`Invalid container size: width=${containerWidth}, height=${containerHeight}`);
            return;
        }
        let canvas = createCanvas(containerWidth, containerHeight);
        canvas.parent('canvas-container');
        console.log("p5.js canvas initialized with size:", width, height);
        noLoop();
    } catch (error) {
        console.error("Error initializing canvas:", error);
    }
    
    let inputNeurons = [];
    let hidden1Neurons = [];
    let hidden2Neurons = [];
    let outputNeurons = [];
    
    for (let i = 0; i < 4; i++) {
        inputNeurons.push({
            x: width * 0.15,
            y: height * 0.25 + i * height * 0.15,
            active: false,
            label: inputLabels[i],
            color: inputColors[i],
            value: inputValues[i]
        });
    }
    
    for (let i = 0; i < 10; i++) {
        hidden1Neurons.push({
            x: width * 0.35,
            y: height * 0.1 + i * height * 0.095,
            active: false,
            label: `H1-${i+1}`,
            color: '#FFFFFF',
            value: null
        });
    }
    
    for (let i = 0; i < 10; i++) {
        hidden2Neurons.push({
            x: width * 0.55,
            y: height * 0.1 + i * height * 0.095,
            active: false,
            label: `H2-${i+1}`,
            color: '#FFFFFF',
            value: null
        });
    }
    
    // Three output neurons for Laminar, Transitional, Turbulent
    const outputLabels = ['Laminar', 'Transitional', 'Turbulent'];
    for (let i = 0; i < 3; i++) {
        outputNeurons.push({
            x: width * 0.75,
            y: height * 0.3 + i * height * 0.15,
            active: false,
            label: outputLabels[i],
            color: outputColors[i],
            value: null
        });
    }
    
    neurons = [inputNeurons, hidden1Neurons, hidden2Neurons, outputNeurons];
    
    connections = [];
    for (let i = 0; i < inputNeurons.length; i++) {
        for (let j = 0; j < hidden1Neurons.length; j++) {
            connections.push({ start: inputNeurons[i], end: hidden1Neurons[j], weight: 0.1, color: inputNeurons[i].color });
        }
    }
    for (let i = 0; i < hidden1Neurons.length; i++) {
        for (let j = 0; j < hidden2Neurons.length; j++) {
            connections.push({ start: hidden1Neurons[i], end: hidden2Neurons[j], weight: 0.2, color: '#808080' });
        }
    }
    for (let i = 0; i < hidden2Neurons.length; i++) {
        for (let j = 0; j < outputNeurons.length; j++) {
            connections.push({ start: hidden2Neurons[i], end: outputNeurons[j], weight: 0.3, color: '#808080' });
        }
    }
    console.log("Setup completed, neurons and connections initialized");
}

function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function blendColors(colors, weights) {
    let r = 0, g = 0, b = 0;
    let totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < colors.length; i++) {
        let c = color(colors[i]);
        r += red(c) * weights[i];
        g += green(c) * weights[i];
        b += blue(c) * weights[i];
    }
    r /= totalWeight;
    g /= totalWeight;
    b /= totalWeight;
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function brightenColor(hexColor, factor = 1.2) {
    let c = color(hexColor);
    let r = constrain(red(c) * factor, 0, 255);
    let g = constrain(green(c) * factor, 0, 255);
    let b = constrain(blue(c) * factor, 0, 255);
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function createPixelGrid(weights, layerIndex, neuronIndex) {
    let totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    let normalizedWeights = weights.map(w => w / totalWeight);
    
    let amplifiedWeights = normalizedWeights.map(w => Math.pow(w, 0.5));
    let amplifiedTotal = amplifiedWeights.reduce((a, b) => a + b, 0) || 1;
    normalizedWeights = amplifiedWeights.map(w => w / amplifiedTotal);
    
    normalizedWeights = normalizedWeights.map(w => Number(w.toFixed(6)));
    
    let medium = document.getElementById('medium').value;
    let inputStr = inputValues.map((v, i) => {
        let precision = i === 0 ? 2 : i === 1 ? 3 : i === 2 ? 4 : 6;
        return v.toFixed(precision);
    }).join(',');
    let key = `medium${medium}_layer${layerIndex}_neuron${neuronIndex}_inputs${inputStr}`;
    let seed = simpleHash(key);
    
    if (pixelGridCache[key]) {
        return pixelGridCache[key];
    }
    
    let totalPixels = pixelGridSize * pixelGridSize;
    let pixelCounts = normalizedWeights.map(w => Math.round(w * totalPixels));
    let sumCounts = pixelCounts.reduce((a, b) => a + b, 0);
    
    if (sumCounts > totalPixels) {
        let excess = sumCounts - totalPixels;
        let maxIndex = pixelCounts.indexOf(Math.max(...pixelCounts));
        pixelCounts[maxIndex] -= excess;
    } else if (sumCounts < totalPixels) {
        let deficit = totalPixels - sumCounts;
        let minIndex = pixelCounts.indexOf(Math.min(...pixelCounts));
        pixelCounts[minIndex] += deficit;
    }
    
    let pixels = [];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < pixelCounts[i]; j++) {
            pixels.push(i);
        }
    }
    
    let positions = [];
    for (let i = 0; i < pixelGridSize; i++) {
        for (let j = 0; j < pixelGridSize; j++) {
            positions.push([i, j]);
        }
    }
    
    for (let i = positions.length - 1; i > 0; i--) {
        seed = seededRandom(seed);
        let j = Math.floor(seed * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    let grid = Array(pixelGridSize).fill().map(() => Array(pixelGridSize).fill(null));
    
    let pixelIndex = 0;
    for (let featureIndex = 0; featureIndex < 4; featureIndex++) {
        let count = pixelCounts[featureIndex];
        let norm = normalizedWeights[featureIndex];
        let pixelColor = lerpColor(color(lightColors[featureIndex]), color(darkColors[featureIndex]), norm);
        
        for (let j = 0; j < count && pixelIndex < positions.length; j++) {
            let [i, k] = positions[pixelIndex];
            grid[i][k] = pixelColor;
            pixelIndex++;
        }
    }
    
    let defaultFeature = pixelCounts.indexOf(Math.max(...pixelCounts));
    let defaultNorm = normalizedWeights[defaultFeature];
    let defaultColor = lerpColor(color(lightColors[defaultFeature]), color(darkColors[defaultFeature]), defaultNorm);
    
    for (let i = 0; i < pixelGridSize; i++) {
        for (let j = 0; j < pixelGridSize; j++) {
            if (!grid[i][j]) {
                grid[i][j] = defaultColor;
            }
        }
    }
    
    pixelGridCache[key] = grid;
    return grid;
}

function drawPatchyNeuron(x, y, baseColor, inputWeights, layerIndex, neuronIndex) {
    push();
    rectMode(CENTER);
    fill(baseColor);
    stroke('#4B0082');
    strokeWeight(1.5);
    let size = Math.min(width, height) * 0.075;
    rect(x, y, size, size);
    
    let pixelSize = size / pixelGridSize;
    let grid = createPixelGrid(inputWeights, layerIndex, neuronIndex);
    for (let i = 0; i < pixelGridSize; i++) {
        for (let j = 0; j < pixelGridSize; j++) {
            fill(grid[i][j]);
            noStroke();
            rect(x - size / 2 + j * pixelSize + pixelSize / 2, y - size / 2 + i * pixelSize + pixelSize / 2, pixelSize, pixelSize);
        }
    }
    pop();
}

function drawSelection() {
    for (let layerIndex = 0; layerIndex < neurons.length; layerIndex++) {
        let layer = neurons[layerIndex];
        let size = Math.min(width, height) * 0.075;
        for (let neuron of layer) {
            if (selectedNeuron === neuron) {
                push();
                rectMode(CENTER);
                stroke('#000000');
                strokeWeight(3);
                noFill();
                rect(neuron.x, neuron.y, size, size);
                pop();
            }
        }
    }
}

function draw() {
    let currentTime = millis();
    if (currentTime - lastDrawTime < drawInterval) {
        return;
    }
    lastDrawTime = currentTime;
    
    if (!shouldDraw) {
        drawSelection();
        return;
    }
    
    if (currentStep <= transitionSteps) {
        for (let i = 0; i < inputValues.length; i++) {
            inputValues[i] += (targetInputValues[i] - inputValues[i]) / (transitionSteps - currentStep + 1);
        }
        currentStep++;
        if (currentStep > transitionSteps) {
            inputValues = [...targetInputValues];
            noLoop();
        }
    }
    
    background(255);
    console.log("Drawing canvas with neurons:", neurons.length, "connections:", connections.length);
    
    const medium = document.getElementById('medium').value;
    const ranges = medium === 'liquid' ? {
        density: { min: 715.6277903038863, max: 1032.9733671921813 },
        velocity: { min: 0, max: 8.451995705516785 },
        diameter: { min: 0, max: 0.36748163999068206 },
        viscosity: { min: 7.699317799509498e-05, max: 0.006080380547145805 }
    } : {
        density: { min: 0, max: 20.36578206659651 },
        velocity: { min: 0, max: 52.499443580940465 },
        diameter: { min: 0, max: 0.5249885104741552 },
        viscosity: { min: 6.100923200764568e-07, max: 2.8885055939928103e-05 }
    };
    
    let inputWeights = inputValues.map((v, i) => {
        let key = ['density', 'velocity', 'diameter', 'viscosity'][i];
        let range = ranges[key];
        let normalized = (v - range.min) / (range.max - range.min);
        return constrain(normalized, 0.1, 1.0);
    });
    
    let totalWeight = inputWeights.reduce((a, b) => a + b, 0) || 1;
    inputWeights = inputWeights.map(w => Math.max(w / totalWeight, 0.1));
    
    for (let i = 0; i < inputColors.length; i++) {
        let norm = inputWeights[i] / Math.max(...inputWeights);
        inputColors[i] = lerpColor(color(lightColors[i]), color(darkColors[i]), norm);
        neurons[0][i].color = inputColors[i];
    }
    
    for (let neuron of neurons[1]) {
        neuron.color = blendColors(inputColors, inputWeights);
    }
    
    let hidden1Colors = neurons[1].map(n => n.color);
    let hidden1Weights = Array(10).fill(0.2);
    for (let neuron of neurons[2]) {
        neuron.color = blendColors(hidden1Colors, hidden1Weights);
    }
    
    let hidden2Colors = neurons[2].map(n => n.color);
    let hidden2Weights = Array(10).fill(0.2);
    
    // Color output neurons: darker for predicted regime, lighter for others
    let predictedRegime = document.getElementById('predicted-regime').textContent;
    for (let i = 0; i < neurons[3].length; i++) {
        let neuron = neurons[3][i];
        neuron.color = predictedRegime === neuron.label ? outputDarkColors[i] : outputLightColors[i];
    }
    
    for (let conn of connections) {
        let startLayer = neurons.findIndex(layer => layer.includes(conn.start));
        let weightFactor = 1;
        if (startLayer === 0) {
            let startIndex = neurons[0].indexOf(conn.start);
            weightFactor = Math.max(inputWeights[startIndex], 0.2);
            conn.color = inputColors[startIndex];
        } else if (startLayer === 1) {
            weightFactor = 0.3;
            conn.color = blendColors(inputColors, inputWeights);
        } else if (startLayer === 2) {
            weightFactor = 0.3;
            let endIndex = neurons[3].indexOf(conn.end);
            // Use the current neuron color for connections to output
            conn.color = neurons[3][endIndex].color;
        }
        if (selectedNeuron === conn.start || selectedNeuron === conn.end) {
            stroke(color('#000000'));
            strokeWeight(2);
        } else {
            stroke(color(conn.color));
            strokeWeight(Math.max(weightFactor * 2, 1));
        }
        line(conn.start.x, conn.start.y, conn.end.x, conn.end.y);
    }
    
    for (let layerIndex = 0; layerIndex < neurons.length; layerIndex++) {
        let layer = neurons[layerIndex];
        let size = Math.min(width, height) * 0.075;
        for (let neuronIndex = 0; neuronIndex < layer.length; neuronIndex++) {
            let neuron = layer[neuronIndex];
            let isSelected = selectedNeuron === neuron;
            let baseColor = isSelected ? brightenColor(neuron.color, 1.2) : color(neuron.color);
            
            if (layerIndex === 0) {
                fill(inputColors[neuronIndex]);
                stroke('#4B0082');
                strokeWeight(isSelected ? 3 : 1.5);
                rectMode(CENTER);
                rect(neuron.x, neuron.y, size, size);
            } else if (layerIndex === 3) {
                fill(neuron.color);
                stroke('#4B0082');
                strokeWeight(isSelected ? 3 : 1.5);
                rectMode(CENTER);
                rect(neuron.x, neuron.y, size, size);
            } else {
                drawPatchyNeuron(neuron.x, neuron.y, baseColor, inputWeights, layerIndex, neuronIndex);
                if (isSelected) {
                    stroke('#000000');
                    strokeWeight(3);
                    noFill();
                    rect(neuron.x, neuron.y, size, size);
                }
            }
        }
    }
    
    textSize(18);
    textFont('Inter');
    textAlign(CENTER);
    let selectedLayerIndex = selectedNeuron ? neurons.findIndex(layer => layer.includes(selectedNeuron)) : -1;
    
    fill(selectedLayerIndex === 0 ? color('#1E90FF') : color('#aa98b8'));
    text("Input Layer", width * 0.15, height * 0.03);
    fill(selectedLayerIndex === 1 ? color('#1E90FF') : color('#aa98b8'));
    text("Hidden Layer 1", width * 0.35, height * 0.03);
    fill(selectedLayerIndex === 2 ? color('#1E90FF') : color('#aa98b8'));
    text("Hidden Layer 2", width * 0.55, height * 0.03);
    fill(selectedLayerIndex === 3 ? color('#1E90FF') : color('#aa98b8'));
    text("Output Layer", width * 0.75, height * 0.03);
    
    drawSelection();
}

function mousePressed() {
    selectedNeuron = null;
    let size = Math.min(width, height) * 0.075;
    for (let layer of neurons) {
        for (let neuron of layer) {
            if (mouseX > neuron.x - size / 2 && mouseX < neuron.x + size / 2 && mouseY > neuron.y - size / 2 && mouseY < neuron.y + size / 2) {
                selectedNeuron = neuron;
                console.log("Neuron selected:", neuron.label);
                break;
            }
        }
        if (selectedNeuron) break;
    }
    redraw();
}

function updateInputValues(id, value, triggerAnimation) {
    try {
        const precisionMap = {
            density: 2,
            velocity: 3,
            diameter: 4,
            viscosity: 6
        };
        
        let inputHash = inputValues.map((v, i) => v.toFixed(precisionMap[inputLabels[i].toLowerCase()])).join(',');
        if (id && typeof value === 'string' && !triggerAnimation) {
            const index = ['density', 'velocity', 'diameter', 'viscosity'].indexOf(id);
            if (index !== -1) {
                let parsedValue = parseFloat(value);
                parsedValue = Number(parsedValue.toFixed(precisionMap[id]));
                targetInputValues[index] = parsedValue;
                neurons[0][index].value = parsedValue;
                currentStep = 0;
                shouldDraw = true;
                let newInputHash = targetInputValues.map((v, i) => v.toFixed(precisionMap[inputLabels[i].toLowerCase()])).join(',');
                if (newInputHash !== lastInputHash) {
                    pixelGridCache = {};
                    lastInputHash = newInputHash;
                }
                loop();
            }
        } else if (arguments.length >= 4) {
            targetInputValues = Array.from(arguments).slice(0, 4).map((v, i) => {
                let parsed = parseFloat(v);
                return Number(parsed.toFixed(precisionMap[inputLabels[i].toLowerCase()]));
            });
            for (let i = 0; i < neurons[0].length; i++) {
                neurons[0][i].value = targetInputValues[i];
            }
            if (triggerAnimation) {
                currentStep = 0;
                shouldDraw = true;
                let newInputHash = targetInputValues.map((v, i) => v.toFixed(precisionMap[inputLabels[i].toLowerCase()])).join(',');
                if (newInputHash !== lastInputHash) {
                    pixelGridCache = {};
                    lastInputHash = newInputHash;
                }
                loop();
            }
        }
    } catch (error) {
        console.error("Error updating input values:", error);
    }
}

function windowResized() {
    let container = document.getElementById('canvas-container');
    if (container) {
        let containerWidth = container.offsetWidth;
        let containerHeight = container.offsetHeight;
        if (containerWidth > 0 && containerHeight > 0) {
            resizeCanvas(containerWidth, containerHeight);
            neurons[0].forEach((neuron, i) => {
                neuron.x = width * 0.15;
                neuron.y = height * 0.25 + i * height * 0.15;
            });
            neurons[1].forEach((neuron, i) => {
                neuron.x = width * 0.35;
                neuron.y = height * 0.1 + i * height * 0.095;
            });
            neurons[2].forEach((neuron, i) => {
                neuron.x = width * 0.55;
                neuron.y = height * 0.1 + i * height * 0.095;
            });
            neurons[3].forEach((neuron, i) => {
                neuron.x = width * 0.75;
                neuron.y = height * 0.3 + i * height * 0.15;
            });
            shouldDraw = true;
            loop();
        } else {
            console.error(`Invalid container size on resize: width=${containerWidth}, height=${containerHeight}`);
        }
    }
}