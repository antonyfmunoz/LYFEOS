// Game of Lyfe: Daily Dashboard - Core Logic
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const currentDateEl = document.getElementById('current-date');
    const routineBlocksContainer = document.getElementById('routine-blocks');
    const routineChecklistContainer = document.getElementById('routine-checklist');
    const addRoutineBlockBtn = document.getElementById('add-routine-block');
    const saveLogBtn = document.getElementById('save-log');
    const saveStatusEl = document.getElementById('save-status');
    
    // State Elements - Reflection Sliders
    const mentalStateSlider = document.getElementById('mental-state');
    const physicalStateSlider = document.getElementById('physical-state');
    const emotionalStateSlider = document.getElementById('emotional-state');
    const mentalValueEl = document.getElementById('mental-value');
    const physicalValueEl = document.getElementById('physical-value');
    const emotionalValueEl = document.getElementById('emotional-value');
    
    // State Elements - Text Areas
    const gratitudeTextarea = document.getElementById('gratitude');
    const thoughtsTextarea = document.getElementById('thoughts');
    const contentTextarea = document.getElementById('content');
    const todoIdeasTextarea = document.getElementById('todo-ideas');

    // Templates
    const routineBlockTemplate = document.getElementById('routine-block-template');

    // State
    let currentDate = new Date();
    let routine = [];
    let dailyLog = {
        date: formatDateForStorage(currentDate),
        mental: 5,
        physical: 5,
        emotional: 5,
        gratitude: '',
        thoughts: '',
        content: '',
        todoIdeas: '',
        completedTasks: []
    };

    // Initialize UI
    function init() {
        displayCurrentDate();
        loadRoutine();
        loadDailyLog();
        setupEventListeners();
    }

    // Display Current Date
    function displayCurrentDate() {
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        currentDateEl.textContent = currentDate.toLocaleDateString('en-US', options);
    }

    // Format Date for Storage Key
    function formatDateForStorage(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    // Load Routine from localStorage
    function loadRoutine() {
        const savedRoutine = localStorage.getItem('gameOfLyfe_routine');
        
        if (savedRoutine) {
            routine = JSON.parse(savedRoutine);
            renderRoutineBlocks();
        } else {
            // Add default routine block if none exists
            addRoutineBlock();
        }
        
        renderRoutineChecklist();
    }

    // Load Daily Log from localStorage
    function loadDailyLog() {
        const today = formatDateForStorage(currentDate);
        const savedLog = localStorage.getItem(`gameOfLyfe_dailyLog-${today}`);
        
        if (savedLog) {
            dailyLog = JSON.parse(savedLog);
            
            // Update UI with saved values
            mentalStateSlider.value = dailyLog.mental;
            physicalStateSlider.value = dailyLog.physical;
            emotionalStateSlider.value = dailyLog.emotional;
            mentalValueEl.textContent = dailyLog.mental;
            physicalValueEl.textContent = dailyLog.physical;
            emotionalValueEl.textContent = dailyLog.emotional;
            
            gratitudeTextarea.value = dailyLog.gratitude;
            thoughtsTextarea.value = dailyLog.thoughts;
            contentTextarea.value = dailyLog.content;
            todoIdeasTextarea.value = dailyLog.todoIdeas;
            
            // Update task completion status
            updateTaskCompletionStatus();
        }
    }

    // Update Task Completion Status
    function updateTaskCompletionStatus() {
        const checkboxes = document.querySelectorAll('.task-checkbox');
        
        checkboxes.forEach(checkbox => {
            const taskId = checkbox.dataset.taskId;
            if (dailyLog.completedTasks.includes(taskId)) {
                checkbox.checked = true;
            }
        });
    }

    // Setup Event Listeners
    function setupEventListeners() {
        // Add routine block
        addRoutineBlockBtn.addEventListener('click', addRoutineBlock);
        
        // Save daily log
        saveLogBtn.addEventListener('click', saveDailyLog);
        
        // Update slider values
        mentalStateSlider.addEventListener('input', () => {
            mentalValueEl.textContent = mentalStateSlider.value;
        });
        
        physicalStateSlider.addEventListener('input', () => {
            physicalValueEl.textContent = physicalStateSlider.value;
        });
        
        emotionalStateSlider.addEventListener('input', () => {
            emotionalValueEl.textContent = emotionalStateSlider.value;
        });
    }

    // Add Routine Block
    function addRoutineBlock() {
        const blockFragment = document.importNode(routineBlockTemplate.content, true);
        const blockElement = blockFragment.querySelector('.routine-block');
        const deleteButton = blockElement.querySelector('.delete-block');
        
        // Add event listener for delete button
        deleteButton.addEventListener('click', (e) => {
            const block = e.target.closest('.routine-block');
            const blockIndex = Array.from(routineBlocksContainer.children).indexOf(block);
            
            // Remove from UI
            block.remove();
            
            // Remove from data
            routine.splice(blockIndex, 1);
            
            // Save and re-render routine
            saveRoutine();
            renderRoutineChecklist();
        });
        
        // Add event listeners for input changes
        const inputs = blockElement.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                updateRoutineFromDOM();
            });
        });
        
        routineBlocksContainer.appendChild(blockElement);
        
        // Add to data structure
        routine.push({
            timeBlock: '',
            blockName: '',
            tasks: ''
        });
    }

    // Render Routine Blocks
    function renderRoutineBlocks() {
        // Clear container
        routineBlocksContainer.innerHTML = '';
        
        // Render each routine block
        routine.forEach((block, index) => {
            const blockFragment = document.importNode(routineBlockTemplate.content, true);
            const blockElement = blockFragment.querySelector('.routine-block');
            const timeInput = blockElement.querySelector('.time-block');
            const nameInput = blockElement.querySelector('.block-name');
            const tasksTextarea = blockElement.querySelector('.block-tasks');
            const deleteButton = blockElement.querySelector('.delete-block');
            
            // Set values
            timeInput.value = block.timeBlock;
            nameInput.value = block.blockName;
            tasksTextarea.value = block.tasks;
            
            // Add event listener for delete button
            deleteButton.addEventListener('click', (e) => {
                const block = e.target.closest('.routine-block');
                const blockIndex = Array.from(routineBlocksContainer.children).indexOf(block);
                
                // Remove from UI
                block.remove();
                
                // Remove from data
                routine.splice(blockIndex, 1);
                
                // Save and re-render routine
                saveRoutine();
                renderRoutineChecklist();
            });
            
            // Add event listeners for input changes
            const inputs = blockElement.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                input.addEventListener('change', () => {
                    updateRoutineFromDOM();
                });
            });
            
            routineBlocksContainer.appendChild(blockElement);
        });
    }

    // Update Routine from DOM
    function updateRoutineFromDOM() {
        const blocks = routineBlocksContainer.querySelectorAll('.routine-block');
        
        routine = Array.from(blocks).map(block => {
            return {
                timeBlock: block.querySelector('.time-block').value,
                blockName: block.querySelector('.block-name').value,
                tasks: block.querySelector('.block-tasks').value
            };
        });
        
        saveRoutine();
        renderRoutineChecklist();
    }

    // Save Routine to localStorage
    function saveRoutine() {
        localStorage.setItem('gameOfLyfe_routine', JSON.stringify(routine));
    }

    // Render Routine Checklist
    function renderRoutineChecklist() {
        // Clear container
        routineChecklistContainer.innerHTML = '';
        
        // Render each routine block as a checklist
        routine.forEach((block, blockIndex) => {
            if (!block.timeBlock && !block.blockName && !block.tasks) {
                return; // Skip empty blocks
            }
            
            const checklistBlock = document.createElement('div');
            checklistBlock.className = 'routine-checklist-block';
            
            const header = document.createElement('div');
            header.className = 'routine-checklist-header';
            
            const nameEl = document.createElement('div');
            nameEl.className = 'routine-checklist-name';
            nameEl.textContent = block.blockName || 'Unnamed Block';
            
            const timeEl = document.createElement('div');
            timeEl.className = 'routine-checklist-time';
            timeEl.textContent = block.timeBlock || 'No time set';
            
            header.appendChild(nameEl);
            header.appendChild(timeEl);
            
            const taskList = document.createElement('ul');
            taskList.className = 'task-list';
            
            // Create task items
            const tasks = block.tasks.split(',').filter(task => task.trim());
            
            tasks.forEach((task, taskIndex) => {
                const taskItem = document.createElement('li');
                taskItem.className = 'task-item';
                
                const taskId = `block${blockIndex}-task${taskIndex}`;
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'task-checkbox';
                checkbox.dataset.taskId = taskId;
                
                // Check if task is completed
                if (dailyLog.completedTasks.includes(taskId)) {
                    checkbox.checked = true;
                }
                
                // Add event listener for checkbox
                checkbox.addEventListener('change', () => {
                    const taskId = checkbox.dataset.taskId;
                    
                    if (checkbox.checked) {
                        // Add to completed tasks
                        if (!dailyLog.completedTasks.includes(taskId)) {
                            dailyLog.completedTasks.push(taskId);
                        }
                    } else {
                        // Remove from completed tasks
                        const index = dailyLog.completedTasks.indexOf(taskId);
                        if (index !== -1) {
                            dailyLog.completedTasks.splice(index, 1);
                        }
                    }
                    
                    // Auto-save daily log when tasks are checked
                    saveDailyLog(false);
                });
                
                const label = document.createElement('label');
                label.className = 'task-label';
                label.textContent = task.trim();
                
                taskItem.appendChild(checkbox);
                taskItem.appendChild(label);
                taskList.appendChild(taskItem);
            });
            
            checklistBlock.appendChild(header);
            checklistBlock.appendChild(taskList);
            
            routineChecklistContainer.appendChild(checklistBlock);
        });
    }

    // Save Daily Log
    function saveDailyLog(showConfirmation = true) {
        // Update daily log data
        dailyLog.mental = parseInt(mentalStateSlider.value);
        dailyLog.physical = parseInt(physicalStateSlider.value);
        dailyLog.emotional = parseInt(emotionalStateSlider.value);
        dailyLog.gratitude = gratitudeTextarea.value;
        dailyLog.thoughts = thoughtsTextarea.value;
        dailyLog.content = contentTextarea.value;
        dailyLog.todoIdeas = todoIdeasTextarea.value;
        
        // Save to localStorage
        const today = formatDateForStorage(currentDate);
        localStorage.setItem(`gameOfLyfe_dailyLog-${today}`, JSON.stringify(dailyLog));
        
        // Show save confirmation
        if (showConfirmation) {
            saveStatusEl.textContent = '✅ Daily log saved successfully!';
            saveStatusEl.classList.add('visible');
            
            // Apply pulse animation to Save button
            saveLogBtn.classList.add('pulse');
            
            // Hide confirmation after 3 seconds
            setTimeout(() => {
                saveStatusEl.classList.remove('visible');
                saveLogBtn.classList.remove('pulse');
            }, 3000);
        }
    }

    // Start the app
    init();
});